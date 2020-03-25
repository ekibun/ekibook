---
title: 在TextView里面加载动态Drawable
date: 2020-03-25 14:25:33
tags:
	- android
---

参照[sunhapper](https://www.jianshu.com/p/3ae513115c17)的思路，设置`Drawable.Callback`来刷新`TextView`，但实际操作中踩了一个大坑：应用是用的`Glide`来加载图片，奇怪的是即使`invalidate`掉整个`TextView`也没法刷新`Glide`自带的`GifDrawable`，相对的`android-gif-drawable`即使没有再次调用`Drawable.draw`也能很好的刷新。

<!--more-->

由于`android-gif-drawable`是用`OpenGL`来刷新GIF图片，一开始没敢深究，就把`GifDrawable`转成`android-gif-drawable`。后来，打算用`CircularProgressDrawable`来显示加载进度，这时候`Drawable`就没法转成`android-gif-drawable`了。

被迫研究了`android-gif-drawable`的代码，发现它是创建了一个`Bitmap`来给`OpenGL`进行绘制，再在`Drawable.onDraw`里把`Bitmap`绘制出来。相对的，`GifDrawable`是在`Drawable.draw`里直接绘制，由于`Drawable.draw`只调用一次，就没能显示动态的图片。

也就是说，在`TextView`开启硬件加速的情况下，虽然`Drawable.draw`只被调用一次，但是`Bitmap`会以引用的形式传递给GPU，**修改`Bitmap`就能在下次绘制时更新图像**。

那么我们继承`AnimationDrawable`来写个Wrapper，它包含一个`drawable`变量，当然也有一个`Bitmap`缓存：

```kotlin
var drawable: Drawable? = null

private var mBuffer: Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
```

首先，在每次修改`drawable`变量时，把原`drawable`停掉，把`Bitmap`的大小设置成和`drawable`一样大，并加上`Drawable.Callback`：

```kotlin
(this.drawable as? Animatable)?.stop()
this.drawable?.callback = null
this.drawable = drawable
this.drawable?.callback = drawableCallback
(drawable as? Animatable)?.start()
setBounds(0, 0, drawable.intrinsicWidth, drawable.intrinsicHeight)
        mBuffer = Bitmap.createBitmap(bounds.width(), bounds.height(), Bitmap.Config.ARGB_8888)
updateBuffer()
```

`drawableCallback`负责在`drawable`更新的时候刷新`Bitmap`，并调用容器的`invalidate`：

```kotlin
fun updateBuffer() {
    val bufferCanvas = Canvas(mBuffer)
    bufferCanvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    drawable?.draw(bufferCanvas)
    invalidateSelf()
}

val drawableCallback = object : Callback {
    override fun invalidateDrawable(who: Drawable) {
        updateBuffer()
        container.get()?.invalidate()
    }

    override fun scheduleDrawable(who: Drawable, what: Runnable, `when`: Long) {
        container.get()?.postDelayed(what, `when`)
    }

    override fun unscheduleDrawable(who: Drawable, what: Runnable) {
        container.get()?.removeCallbacks(what)
    }
}
```

最后在`draw`里把`Bitmap`绘制出来就完成了：

```kotlin
private val mPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)

override fun draw(canvas: Canvas) {
    canvas.drawBitmap(mBuffer, bounds, bounds, mPaint)
}
```

[完整代码传送门](https://github.com/ekibun/Bangumi/blob/master/app/src/main/java/soko/ekibun/bangumi/util/UrlDrawable.kt)