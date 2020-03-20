---
title: 漫画阅读器（三）翻页LayoutManager
date: 2020-03-19 23:50:12
tags: 
	- android
---

看漫画我觉得还是卷纸模式舒服，小说的话翻书模式似乎好点。

还是从`LinearLayoutManager`开始，自带的`onLayoutChildren`自然就不能用了。

<!--more-->

弄个`currentPos`存当前位置，重写`onLayoutChildren`：

```kotlin
var currentPos = 0f

override fun onLayoutChildren(recycler: RecyclerView.Recycler, state: RecyclerView.State) {
    if (orientation == VERTICAL) return super.onLayoutChildren(recycler, state)
    detachAndScrapAttachedViews(recycler)

    currentPos = Math.max(0f, Math.min(currentPos, itemCount - 1f))
    if (state.itemCount <= 0 || state.isPreLayout) return
    downPage = currentPos.toInt()

    val currentIndex = currentPos.toInt()
    val view = recycler.getViewForPosition(currentIndex)
    addView(view)
    measureChildWithMargins(view, 0, 0)
    view.translationZ = 50f
    view.translationX = -(currentPos - currentIndex) * width
    layoutDecoratedWithMargins(view, 0, 0, view.measuredWidth, view.measuredHeight)
    // 前一个
    if (currentIndex - 1 >= 0) {
        val nextView = recycler.getViewForPosition(currentIndex - 1)
        addView(nextView)
        nextView.translationX = -width * scale
        nextView.translationZ = 100f
        measureChildWithMargins(nextView, 0, 0)
        layoutDecoratedWithMargins(nextView, 0, 0, view.measuredWidth, view.measuredHeight)
    }
    // 后一个
    if (currentIndex + 1 < state.itemCount) {
        val nextView = recycler.getViewForPosition(currentIndex + 1)
        addView(nextView)
        nextView.translationX = 0f
        nextView.translationZ = 0f
        measureChildWithMargins(nextView, 0, 0)
        layoutDecoratedWithMargins(nextView, 0, 0, view.measuredWidth, view.measuredHeight)
    }
}
```

首先根据`itemCount`约束`currentPos`的范围，`onLayoutChildren`要执行以下四步

- `detachAndScrapAttachedViews(recycler)` 将所有子项回收

- `recycler.getViewForPosition(currentIndex)` 获取子项
- `measureChildWithMargins` 测量子项
- `layoutDecoratedWithMargins` 布局子项

翻页只需要布局前后和当前三个子项，这里用`translationX`来位移子项，防止和缩放冲突，修改`translationZ`既能改变层级关系，还能给下层View带上阴影，一举两得。

`currentPos`独立于`LinearlayoutManager`，因此和位置相关的方法要一起重写，首先是`computeHorizontalScrollOffset`和`computeHorizontalScrollRange`，这两个函数返回的值用来判断是否滚动到边界：

```kotlin
override fun computeHorizontalScrollOffset(state: RecyclerView.State): Int {
    return if (orientation == VERTICAL) super.computeHorizontalScrollOffset(state)
    else (currentPos * width).toInt() + if (scale > 1f) 1 else 0
}

override fun computeHorizontalScrollRange(state: RecyclerView.State): Int {
    return if (orientation == VERTICAL) super.computeHorizontalScrollRange(state)
    else itemCount * width
}
```

我一般只用`scrollToPositionWithOffset`修改位置，所以只重写这个：

```kotlin
override fun scrollToPositionWithOffset(position: Int, offset: Int) {
    currentPos = position.toFloat()
    super.scrollToPositionWithOffset(position, offset)
}
```

`measureChildWithMargins`在缩放的基础上，还要判断View是否小于`RecyclerView`的高度，小于要改成铺满

```kotlin
override fun measureChildWithMargins(child: View, widthUsed: Int, heightUsed: Int) {
	...
    if (orientation == VERTICAL || child.measuredHeight >= height) return
    child.measure(
        widthSpec, RecyclerView.LayoutManager.getChildMeasureSpec(
            height, heightMode,
            paddingTop + paddingBottom
                    + lp.topMargin + lp.bottomMargin + heightUsed, RecyclerView.LayoutParams.MATCH_PARENT,
            canScrollVertically()
        )
    )
}
```

同时，`offset`多了竖向偏移，要把`offsetX`复制一遍变成`offsetY`，`scrollVerticallyBy`不能像横向一样由宽度乘以`scale`得到，要获取当前子项的实际高度：

```
override fun scrollVerticallyBy(dy: Int, recycler: RecyclerView.Recycler, state: RecyclerView.State?): Int {
    if (orientation == VERTICAL) return super.scrollVerticallyBy(dy, recycler, state)

    val view = findViewByPosition(currentPos.toInt())
    val ddy = Math.max(Math.min(dy, (view?.height ?: height) - height - offsetY), -offsetY)
    offsetY += ddy
    offsetChildrenVertical(-ddy)
    return if (scale == 1f) dy else ddy
}
```

在横向滚动`scrollHorizontallyBy`处理翻页：

```kotlin
override fun scrollHorizontallyBy(dx: Int, recycler: RecyclerView.Recycler, state: RecyclerView.State): Int {
    val view = findViewByPosition(downPage)
    val ddx = Math.max(
        Math.min(
            dx,
            (if (orientation == VERTICAL) (width * scale).toInt() else view?.width ?: width) - width - offsetX
        ), -offsetX
    )
    offsetX += ddx
    offsetChildrenHorizontal(-ddx)
    view?.translationX = 0f
    for (i in 0 until recyclerView.childCount) updateContent(recyclerView.getChildAt(i), this)

    if (orientation == VERTICAL || scale > 1 || doingScale || view == null) return if (scale == 1f) dx else ddx

    currentPos = Math.max(downPage - 1f, Math.min(currentPos + dx.toFloat() / width, downPage + 1f))
    currentPos = Math.max(0f, Math.min(currentPos, itemCount - 1f))
    view.translationX = -Math.max((currentPos - downPage) * width, 0f)
    if (currentPos < downPage) findViewByPosition(downPage - 1)?.translationX = -(currentPos - downPage + 1) * width
    return dx
}
```

最后，仿照`SnapHelper`让页面保持对齐：

```kotlin
view.onFlingListener = object : RecyclerView.OnFlingListener() {
    override fun onFling(velocityX: Int, velocityY: Int): Boolean {
        val minFlingVelocity = recyclerView.minFlingVelocity
        if (orientation == VERTICAL || scale > 1f) return false

        val targetPos = when {
            Math.abs(velocityX) < minFlingVelocity -> Math.round(currentPos)
            velocityX < 0 -> currentPos.toInt()
            else -> Math.min(currentPos.toInt() + 1, itemCount - 1)
        }
        snapToTarget(targetPos)

        return true
    }
}
view.addOnScrollListener(object : RecyclerView.OnScrollListener() {
    override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
        super.onScrollStateChanged(recyclerView, newState)
        if (orientation == VERTICAL || scale > 1f) return
        if (newState == RecyclerView.SCROLL_STATE_IDLE) {
            snapToTarget(Math.round(currentPos))
        }
    }
})
```

`snapToTarget`是抄的`PagerSnapHelper`：

```kotlin
fun snapToTarget(targetPos: Int) {
    if (targetPos < 0 || targetPos > itemCount - 1) return
    val smoothScroller: LinearSmoothScroller = createSnapScroller(targetPos)
    smoothScroller.targetPosition = targetPos
    startSmoothScroll(smoothScroller)
}

private fun createSnapScroller(targetPos: Int): LinearSmoothScroller {
    return object : LinearSmoothScroller(recyclerView.context) {
        override fun onTargetFound(targetView: View, state: RecyclerView.State, action: Action) {
            Log.v("snap", "$currentPos $targetPos")
            val dx = -((currentPos - targetPos) * (width + 0.5f)).toInt()
            val time = calculateTimeForDeceleration(Math.abs(dx))
            if (time > 0) {
                action.update(dx, 0, time, mDecelerateInterpolator)
            }
        }

        override fun calculateSpeedPerPixel(displayMetrics: DisplayMetrics): Float {
            return MILLISECONDS_PER_INCH / displayMetrics.densityDpi
        }

        override fun calculateTimeForScrolling(dx: Int): Int {
            return Math.min(
                MAX_SCROLL_ON_FLING_DURATION,
                super.calculateTimeForScrolling(dx)
            )
        }
    }
}

companion object {
    const val MILLISECONDS_PER_INCH = 100f
    const val MAX_SCROLL_ON_FLING_DURATION = 100 // ms
}
```

[完整代码传送门](https://github.com/ekibun/BangumiPlugin/blob/master/app/src/main/java/soko/ekibun/bangumi/plugins/ui/view/BookLayoutManager.kt)

