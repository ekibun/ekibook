---
title: 漫画阅读器（一）造一个可以上下左右滑动加载的容器
date: 2020-03-19 21:31:24
tags: 
	- android
---

最近在搞漫画阅读器，阅读器有横向翻页和纵向卷纸两种模式，然后要在横向翻页模式的时候，能够在最后一页左滑加载下一章，在卷纸模式的时候又能够到底时上拉加载下一章。

<!--more-->

国际惯例先放效果：

![](../images/manga_prev.gif)

一开始没搞横向翻页的时候用的是[AnythingPullLayout](https://github.com/TruthKeeper/AnythingPull)，效果还不错，那么轮子就以这个为基础造，沿用它的命名，上一章的叫刷新，下一章的叫加载。

首先约定子View只有一个，根据子View的方向判断是横向还是纵向：

```kotlin
val contentView by lazy { getChildAt(0) }

val isHorizontal get() = ((contentView as RecyclerView).layoutManager as LinearLayoutManager).orientation == RecyclerView.HORIZONTAL
```

然后需要一个参数保存拉动的距离，一个参数保存是否加载的状态，约定不能同时既刷新又加载，统一用一组参数来：

```kotlin
/**
 * 拖动距离
 * + 下拉刷新
 * - 上拉加载
 */
var offset = 0

var loading = false
```

只做`AnytingPullLayout`的普通模式，留一个距离显示加载状态的View，再定一个距离作为触发距离：

```kotlin
// 显示加载状态的距离
val anchorDistance = ResourceUtil.dip2px(context, 36f)
// 触发距离
val triggerDistance = 2 * anchorDistance
```

继承`ViewGroup`要实现`onLayout`方法，根据方向和状态给子View加偏移：

```kotlin
override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val isHorizontal = isHorizontal
    val offsetX = l + if (isHorizontal) offset else 0
    val offsetY = t + if (isHorizontal) 0 else offset
    contentView.layout(l + offsetX, t + offsetY, r + offsetX, b + offsetY)
}
```

`onMeasure`虽然没有抽象，但是不重写显示不了View：

```kotlin
override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    measureChildren(widthMeasureSpec, heightMeasureSpec)
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
}
```

然后重写`dispatchTouchEvent`监听触摸消息：

```kotlin
val touchSlop = ResourceUtil.dip2px(context, 1f)

var hasCancel = false
var lastTouchPos = 0
override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    val curTouchPos = if (isHorizontal) ev.x.toInt() else ev.y.toInt()
    when (ev.action) {
        MotionEvent.ACTION_DOWN -> {
            lastTouchPos = curTouchPos
            hasCancel = false
            super.dispatchTouchEvent(ev)
            return true
        }
        MotionEvent.ACTION_MOVE -> {
            val delta = curTouchPos - lastTouchPos
            lastTouchPos = curTouchPos
            if (Math.abs(delta) > touchSlop && !loading) {
                val lastOffset = offset
                offset += (delta * when {
                    offset * delta < 0 -> 1f // 反向无阻力
                    !canChildScroll(-delta) -> 0.6f // 同向检查子View能否滚动，并带上阻力
                    else -> 0f // 子View能滚动则不管
                }).toInt()
                if (lastOffset * offset < 0) offset = 0 // 反向置0
                if (lastOffset != offset) {
                    if (!hasCancel) {
                        super.dispatchTouchEvent(
                            MotionEvent.obtain(
                                ev.downTime, ev.eventTime + ViewConfiguration.getLongPressTimeout(),
                                MotionEvent.ACTION_CANCEL, ev.x, ev.y, ev.metaState
                            )
                        )
                        hasCancel = true
                    }
                    updateProgress()
                    requestLayout()
                    return true
                }
            }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
            if (!loading && Math.abs(offset) > triggerDistance) {
                loading = true
                startAnimate()
                updateProgress()
                if (offset > 0) listener?.onRefresh() else listener?.onLoad()
            } else startAnimate()
        }
    }
    return super.dispatchTouchEvent(ev)
}
```

`ACTION_MOVE`首先判断是否不在`loading`状态而且移动超过`touchSlop`的距离，是的话通过当前和上一步的触摸位置计算滑动增量，有三种情况：

- 与`offset`方向相反，无阻力，倍率取1
- 与`offset`方向相同，且子View不能滚动，有阻力，倍率取0.6
- 否则子View能滚动，那就不管，倍率取0

刷新不能划成加载，`offset`加上增量之后如果和原来方向相反，则置0。

如果`offset`改变，则说明容器消费了事件，给子View分发`ACTION_CANCEL`防止触发长按事件，并调用`requestLayout`刷新位移，`updateProgress`是用来更新提示的，这个后面再说。

接下来是`ACTION_UP/ACTION_CANCEL`，滑动结束时判断`offset`是否超过触发距离，修改`loading`状态，触发`listener`，并滑到对应的位置。

动画抄的轮子，动画更新时，更新`offset`，同时调用子View的`scrollBy`，这样能把上下章的内容显示一点出来：

```kotlin
var animator: ValueAnimator? = null
private fun startAnimate() {
    animator?.cancel()
    val from = offset
    val to = if (loading) anchorDistance * sign(offset.toFloat()).toInt() else 0
    if (from == to) return
    animator = ValueAnimator.ofInt(from, to)
    animator?.duration = 300
    animator?.interpolator = AccelerateDecelerateInterpolator()
    animator?.addUpdateListener {
        val lastOffset = offset
        offset = it.animatedValue as Int
        val delta = offset - lastOffset
        contentView.scrollBy(if (isHorizontal) delta else 0, if (isHorizontal) 0 else delta)
        requestLayout()
    }
    animator?.start()
}
```

然后是`listener`，跟轮子一样搞两个回调函数

```kotlin
interface PullLoadListener {
    fun onLoad()
    fun onRefresh()
}

var listener: PullLoadListener? = null
```

同样写一个`response`函数，用于加载结束的回调

```kotlin
fun response(finish: Boolean) {
    if (!loading) return
    updateProgress(if (finish) "加载成功" else "加载失败")
    postDelayed({
        loading = false
        startAnimate()
    }, 750)
}
```

`updateProgress`函数用于更新加载View的状态，学`SwipeRefreshLayout`用了个`CircularProgressDrawable`

```kotlin
val loadView by lazy {
    val view = LayoutInflater.from(context).inflate(R.layout.item_pull_load, this, false)
    view.item_progress.setImageDrawable(progressDrawable)
    addView(view)
    view
}

private val progressDrawable by lazy {
    val dp = ResourceUtil.dip2px(context, 100f) / 100f
    val drawable = CircularProgressDrawable(context)
    drawable.setArrowDimensions(5 * dp, 5 * dp)
    drawable.setColorSchemeColors(ResourceUtil.resolveColorAttr(context, R.attr.colorAccent))
    drawable.strokeWidth = 2 * dp
    drawable.centerRadius = 5 * dp
    drawable
}
private fun updateProgress(hint: String? = null) {
    loadView.item_hint.text = hint ?: when {
        loading -> "加载中..."
        Math.abs(offset) > triggerDistance -> "释放加载"
        offset > 0 -> "加载上一章"
        else -> "加载下一章"
    }
    progressDrawable.arrowEnabled = !loading
    if (progressDrawable.arrowEnabled) {
        progressDrawable.alpha = Math.min(255, (Math.abs(offset) * 255 / (1f + anchorDistance * 2f)).toInt())
        progressDrawable.setStartEndTrim(0f, Math.min(0.75f, Math.abs(offset) / (1f + anchorDistance * 3f)))
        progressDrawable.progressRotation = offset * 0.01f
    } else {
        progressDrawable.alpha = 255
    }
}
```

这里用一个View来显示上下左右的提示，所以要在`onLayout`里更新提示view的位置：

```kotlin
override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val isHorizontal = isHorizontal
    val offsetX = l + if (isHorizontal) offset else 0
    val offsetY = t + if (isHorizontal) 0 else offset
    contentView.layout(l + offsetX, t + offsetY, r + offsetX, b + offsetY)
    loadView.visibility = if (offset == 0) View.INVISIBLE else View.VISIBLE
    if (offset == 0) return
    loadView.rotation = if (isHorizontal) -90f else 0f
    val offsetHeight = if (offset < 0) -loadView.measuredHeight else loadView.measuredHeight
    val translateX = if (isHorizontal) (offset + width) % width - (offsetHeight + loadView.measuredWidth) / 2
    else (width - loadView.measuredWidth) / 2
    val translateY = if (isHorizontal) height / 2
    else (offset + height) % height - (loadView.measuredHeight + offsetHeight) / 2
    loadView.layout(
        translateX,
        translateY,
        loadView.measuredWidth + translateX,
        loadView.measuredHeight + translateY
    )
}
```

[完整代码传送门](https://github.com/ekibun/BangumiPlugin/blob/master/app/src/main/java/soko/ekibun/bangumi/plugins/ui/view/PullLoadLayout.kt)