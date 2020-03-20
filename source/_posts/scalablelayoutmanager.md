---
title: 漫画阅读器（二）可缩放的LayoutManager
date: 2020-03-19 22:42:48
tags: 
	- android
mathjax: true
---

还是漫画阅读器，数据的加载当然用的是`RecyclerView`，作为一个合格的漫画阅读器，缩放是必备功能了。从头手撸`LayoutManager`还是太难了，那么就从继承`LinearlayoutManager`开始。

<!--more-->

`onLayoutChildren`太长了懒得看，但layout一定会调用`measureChildWithMargins`和`layoutDecoratedWithMargins`，hook就从这两个方法入手。

首先是`measureChildWithMargins`，这里会测量出需要的宽高，先调用`super`更新`widthUsed`和`heightUsed`，再修改`MeasureSpec`改变子项的大小：

```kotlin
var scale = 1f

override fun measureChildWithMargins(child: View, widthUsed: Int, heightUsed: Int) {
    super.measureChildWithMargins(child, widthUsed, heightUsed)
    val lp = child.layoutParams as RecyclerView.LayoutParams
    val widthSpec = RecyclerView.LayoutManager.getChildMeasureSpec(
        (width * scale).toInt(), widthMode,
        paddingLeft + paddingRight
        + lp.leftMargin + lp.rightMargin + widthUsed, lp.width,
        canScrollHorizontally()
    )
    val heightSpec = RecyclerView.LayoutManager.getChildMeasureSpec(
        height, heightMode,
        paddingTop + paddingBottom
        + lp.topMargin + lp.bottomMargin + heightUsed, lp.height,
        canScrollVertically()
    )
    child.measure(widthSpec, heightSpec)
}
```

然后是`layoutDecoratedWithMargins`，在这里返回子项的位置，缩放之后移动的偏移量就在这里加上：

```kotlin
var offsetX = 0

override fun layoutDecoratedWithMargins(child: View, left: Int, top: Int, right: Int, bottom: Int) {
    updateContent(child, this)
    offsetX = Math.max(0, Math.min(right - left - width, offsetX))
    super.layoutDecoratedWithMargins(child, left - offsetX, top, right - offsetX, bottom)
}
```

接下来就是缩放的手势了，搞个`setupWithRecyclerView`把操作合在一起，这里用了`setOnTouchListener`而不是`addOnItemTouchListener`，是因为不知道怎么拦截能保持子项的点击事件：

```kotlin
var doingScale = false
lateinit var recyclerView: RecyclerView

@SuppressLint("ClickableViewAccessibility")
fun setupWithRecyclerView(
    view: RecyclerView,
    onTap: (Int, Int) -> Unit,
    onPress: (View, Int) -> Unit,
    onTouch: (MotionEvent) -> Unit
) {
    recyclerView = view
    view.layoutManager = this
    var beginScale = scale
    val scaleGestureDetector =
        ScaleGestureDetector(view.context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScaleBegin(detector: ScaleGestureDetector?): Boolean {
                beginScale = scale
                currentPos = Math.round(currentPos).toFloat()
                doingScale = true
                requestLayout()
                return super.onScaleBegin(detector)
            }

            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val oldScale = scale
                scale = beginScale * detector.scaleFactor
                scrollOnScale(detector.focusX, detector.focusY, oldScale)
                requestLayout()
                return super.onScale(detector)
            }
        })
    val gestureDetector = GestureDetectorCompat(view.context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
            onTap((e.x).toInt(), (e.y).toInt())
            return super.onSingleTapConfirmed(e)
        }

        override fun onLongPress(e: MotionEvent) {
            view.findChildViewUnder(e.x, e.y)?.let { onPress(it, view.getChildAdapterPosition(it)) }
            super.onLongPress(e)
        }

        override fun onDoubleTap(e: MotionEvent): Boolean {
            val oldScale = scale
            scale = if (scale < 2f) 2f else 1f
            scrollOnScale(e.x, e.y, oldScale)
            requestLayout()
            return super.onDoubleTap(e)
        }
    })
    view.setOnTouchListener { v, event ->
        onTouch(event)
        scaleGestureDetector.onTouchEvent(event)
        gestureDetector.onTouchEvent(event)
        false
    }
}
```

这里用`ScaleGestureDetector`检测缩放手势，同时`GestureDetector`检测双击，注意长按不能写在子项上不然就不能响应手势了。缩放在改变`scale`并`requestLayout`之后，还要滚动一定的距离来保持缩放中心的位置，统一在`scrollOnScale`函数中处理：

```kotlin
fun scrollOnScale(x: Float, y: Float, oldScale: Float) {
    val adapter = recyclerView.adapter
    val anchorPos = (if (adapter is ScalableAdapter) {
        (findFirstVisibleItemPosition()..findLastVisibleItemPosition()).firstOrNull {
            adapter.isItemScalable(it, this)
        } ?: {
            scale = 1f
            null
        }()
    } else findFirstVisibleItemPosition()) ?: return
    recyclerView.scrollBy(((offsetX + x) * (scale - oldScale) / oldScale).toInt(), 0)
    if (orientation == VERTICAL) findViewByPosition(anchorPos)?.let {
        scrollToPositionWithOffset(anchorPos, (y - (-getDecoratedTop(it) + y) * scale / oldScale).toInt())
    }
}
```

因为后来又写了小说阅读器，文字的部分不会向图片一样能缩放，就给`Adapter`带上了一个接口判断对应的子项是否能缩放，如果屏幕中没有能缩放的子项，就把`scale`还原为1，注意竖向的滚动和横向不一样，是通过调用`LinearlayoutManager`的`scrollToPositionWithOffset`实现的。滚动距离按下面的式子算出来：
$$
\begin{align}
滚动位移=&偏移量-原偏移量\cr
=&\left(\frac{原偏移量-缩放中心}{原缩放比}\times 现缩放比+缩放中心\right)-原偏移量\cr
=&\frac{(原偏移量-缩放中心)\times(现缩放比-原缩放比)}{原缩放比}
\end{align}
$$
最后，为了能够横向滚动，要让`canScrollHorizontally`返回`true`：

```kotlin
override fun canScrollVertically(): Boolean = true
```

为了根据滚动修改offset还要重写`scrollHorizontallyBy`：

```kotlin
override fun scrollHorizontallyBy(dx: Int, recycler: RecyclerView.Recycler, state: RecyclerView.State): Int {
    val view = findViewByPosition(downPage)
    val ddx = Math.max(
        Math.min(
            dx,
            (width * scale).toInt() - width - offsetX
        ), -offsetX
    )
    offsetX += ddx
    offsetChildrenHorizontal(-ddx)
    view?.translationX = 0f
    for (i in 0 until recyclerView.childCount) updateContent(recyclerView.getChildAt(i), this)
	return if (scale == 1f) dx else ddx
}
```

首先根据当前的`scale`计算能消耗的位移`ddx`，给`offset`加上，注意这里没法`requestLayout`，只能用`offsetChildrenHorizontal`修改子项的偏移。

下一篇在这个的基础上，将横向改成翻页模式。

[完整代码传送门](https://github.com/ekibun/BangumiPlugin/blob/master/app/src/main/java/soko/ekibun/bangumi/plugins/ui/view/BookLayoutManager.kt)