---
title: webview和下拉刷新
date: 2020-04-07 21:30:10
tags:
	- android
---

下拉刷新`SwipeRefreshLayout`会和`Webview`的竖向滚动冲突，网上各种解决方法五花八门，有重写`SwipeRefreshLayout`的，有给`Webview`触摸加偏移的，但遇到固定页面有嵌套滚动就全阵亡了。一个偶然发现`Webview`也有`OverScrolled`方法，会在滚动超过处理范围时调用，既然知道什么时候过滚动，那问题就迎刃而解了。

<!--more-->

#### 重写WebView

按下的时候置`false`，在`onOverScrolled`更新状态：

```kotlin
var overScrollY = false
override fun onOverScrolled(scrollX: Int, scrollY: Int, clampedX: Boolean, clampedY: Boolean) {
    overScrollY = clampedY
    super.onOverScrolled(scrollX, scrollY, clampedX, clampedY)
}

@SuppressLint("ClickableViewAccessibility")
override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.action == MotionEvent.ACTION_DOWN) overScrollY = false
    return super.onTouchEvent(event)
}
```

#### SwipeRefreshLayout监听

在`SwipeRefreshLayout.setOnChildScrollUpCallback`返回`WebView.overScrollY`：

```kotlin
item_swipe.setOnChildScrollUpCallback { _, _ ->
    !curWebView.overScrollY
}
```

两步搞定，简直不能更简单，更进一步还能适配关联滚动。