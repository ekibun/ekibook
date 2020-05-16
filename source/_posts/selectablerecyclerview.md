---
title: 跨Item文字选择的RecyclerView
date: 2020-05-17 00:43:45
tags:
	- android
---

做个小说阅读器，为了和漫画兼容，放在同一个`RecyclerView`上，支持滚动和翻页两种布局，直接给`TextView`设置选择会阻碍到`RecyclerView`的滚动，并且为了保持渲染的效率，不能把上万字的文本全放一个`TextView`上，那么跨页的选择就成了个问题。

<!--more-->

还是先放效果

![QQ视频20200516233858](selectablerecyclerview/QQ%E8%A7%86%E9%A2%9120200516233858.gif)

#### 文本分页

拆分文本放在了`adatper`里，添加数据和修改布局的时候触发，计算时用一个参照的`ViewHolder`里的`TextView`进行布局：

```kotlin
private fun wrapData(data: List<BookProvider.PageInfo>): List<BookProvider.PageInfo> {
    val ret = ArrayList<BookProvider.PageInfo>()
    data.forEach { page ->
        if (page.content.isNullOrEmpty()) ret += page
        else {
            val pageWidth =
                recyclerView.width - referHolder.itemView.content_container.let { it.paddingLeft + it.paddingRight }
            val layout = referHolder.itemView.item_content.let {
                StaticLayout.Builder.obtain(page.content, 0, page.content.length, it.paint, pageWidth)
                    .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                    .setLineSpacing(it.lineSpacingExtra, it.lineSpacingMultiplier)
                    .setIncludePad(it.includeFontPadding)
                    .setUseLineSpacingFromFallbacks(it.isFallbackLineSpacing)
                    .setBreakStrategy(it.breakStrategy)
                    .setHyphenationFrequency(it.hyphenationFrequency)
                    .setJustificationMode(it.justificationMode)
                    .build()
            }
            val pageHeight =
                recyclerView.height - referHolder.itemView.content_container.let { it.paddingTop + it.paddingBottom }
            var lastTextIndex = 0
            var lastLineBottom = 0
            for (i in 1 until layout.lineCount) {
                val curLineBottom = layout.getLineBottom(i)
                if (curLineBottom - lastLineBottom < pageHeight) continue
                val prevLineEndIndex = layout.getLineVisibleEnd(i - 1)
                ret += BookProvider.PageInfo(
                    content = page.content.substring(lastTextIndex, prevLineEndIndex),
                    ep = page.ep,
                    rawInfo = page,
                    rawRange = Pair(lastTextIndex, prevLineEndIndex)
                )
                lastTextIndex = layout.getLineStart(i)
                lastLineBottom = layout.getLineTop(i)
            }
            ret += BookProvider.PageInfo(
                content = page.content.substring(lastTextIndex),
                ep = page.ep,
                rawInfo = page,
                rawRange = Pair(lastTextIndex, page.content.length)
            )
        }
    }
    var lastEp: BookProvider.BookEpisode? = null
    var lastIndex = 0
    ret.forEachIndexed { index, page ->
        if (lastEp != page.ep) lastIndex = 0
        lastEp = page.ep
        lastIndex += 1
        page.index = lastIndex
    }
    return ret
}
```

#### 文本选择

为了便于拦截触摸事件，重写`RecyclerView`，添加一个选择中的状态，为真就拦截触摸事件进行选择，这里抄了一个`DragSelectTouchListener`的轮子：

```kotlin
@SuppressLint("ClickableViewAccessibility")
override fun onTouchEvent(e: MotionEvent): Boolean {
    if (!isActive) return super.onTouchEvent(e)
    when (e.actionMasked) {
        MotionEvent.ACTION_MOVE -> {
            if ((layoutManager as? BookLayoutManager)?.orientation != LinearLayoutManager.VERTICAL
                || (!inTopSpot && !inBottomSpot)) //更新滑动选择区域
                updateSelectedRange(e.x, e.y)
            //在顶部或者底部触发自动滑动
            processAutoScroll(e)
        }
        MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
            //结束滑动选择，初始化各状态值
            reset()
        }

    }
    return true
}
```

选区的更新在`updateSelectedRange`里面实现，通过长按手势触发`startSelect`开始选择：

```kotlin
fun startSelect(x: Float, y: Float) {
    clearSelect()
    handleOffset = 0
    updateSelectedRange(x, y, true)
}

private fun updateSelectedRange(x: Float, y: Float, isStart: Boolean = false) {
    val child = findChildViewUnder(x, y - handleOffset)?: return
    val position = getChildAdapterPosition(child)
    if (position == NO_POSITION) return
    selectEnd = bookAdapter.data.getOrNull(position)?.let {
        SelectItem(it, textSelectionAdapter.getPosFromPosition(child, x, y - handleOffset))
    }?.also {
        if(!isStart) return@also
        selectStart = it
        isActive = true
    }
    postInvalidate()
}
```

搞个接口，把选择事件交给adapter去处理：

```kotlin
interface TextSelectionAdapter {
    fun drawSelection(c: Canvas, view: View, start: Int?, end: Int?, paint: Paint)

    fun getPosFromPosition(view: View, x: Float, y: Float): Int

    fun getHandlePosition(view: View, offset: Int): Point

    fun getTextHeight(): Int

    fun getSelectionText(startIndex: Int, endIndex: Int, startPos: Int, endPos: Int): String
}
```

为了保持start在end前面，写个wrapper：

```kotlin
fun getSelectRange(): Pair<Pair<Int, SelectItem>, Pair<Int, SelectItem>>? {
    var selectStart = selectStart?: return null
    var selectEnd = selectEnd?: return null
    var startIndex = bookAdapter.data.indexOf(selectStart.item)
    var endIndex = bookAdapter.data.indexOf(selectEnd.item)
    if(startIndex > endIndex || (startIndex == endIndex && selectStart.pos > selectEnd.pos)) {
        startIndex = endIndex.also { endIndex = startIndex }
        selectStart = selectEnd.also { selectEnd = selectStart }
    }
    return (startIndex to selectStart) to (endIndex to selectEnd)
}
```

首先是`getPosFromPosition`，用来从触摸位置获取到对应item内容的相对位置：

```kotlin
override fun getPosFromPosition(view: View, x: Float, y: Float): Int {
    if (view.content_container.visibility != View.VISIBLE) return -1
    view.item_content.getLocationInWindow(posContent)
    return view.item_content.getOffsetForPosition(x - posContent[0] + recyclerView.x, y - posContent[1] + recyclerView.y)
}
```

选区的绘制放在`ItemDecoration.onDrawOver`里：

```kotlin
override fun onDrawOver(c: Canvas, parent: RecyclerView, state: State) {
    super.onDrawOver(c, parent, state)
    val (startPair, endPair) = getSelectRange()?: return
    val (startIndex, selectStart) = startPair
    val (endIndex, selectEnd) = endPair
    val firstVisibleSelectPos = Math.max(startIndex, bookLayoutManager.findFirstVisibleItemPosition())
    val lastVisibleSelectPos = Math.min(endIndex, bookLayoutManager.findLastVisibleItemPosition())
    for (pos in firstVisibleSelectPos..lastVisibleSelectPos) {
        textSelectionAdapter.drawSelection(c, bookLayoutManager.findViewByPosition(pos)?:continue,
            if(pos == startIndex) selectStart.pos else null,
            if(pos == endIndex) selectEnd.pos else null, paint)
    }
}
```

绘制也转发给adapter去处理，要注意的是如果跨越了两个Item，光用`Layout.getSelectionPath`最后一行并不会画满一整行，需要补全空余位置：

```kotlin
val path = Path()
private val posContent = IntArray(2)
override fun drawSelection(c: Canvas, view: View, start: Int?, end: Int?, paint: Paint) {
    if (view.content_container.visibility != View.VISIBLE) return
    view.item_content.getLocationInWindow(posContent)
    c.save()
    c.translate(posContent[0] - recyclerView.x, posContent[1] - recyclerView.y)
    drawSelectionImpl(c, view, start, end, paint)

    c.restore()
}

private fun drawSelectionImpl(c: Canvas, view: View, start: Int?, end: Int?, paint: Paint) {
    if(start == null && end == null){
        c.drawRect(Rect(0, 0, view.item_content.width, view.item_content.height), paint)
        return
    }
    val layout = view.item_content.layout?: return
    layout.getSelectionPath(start?:0, end?:view.item_content.text.length, path)
    if(end == null){
        val startLine = layout.getLineForOffset(start?: 0)
        val endLine = layout.getLineForOffset(end?: view.item_content.text.length)
        path.addRect(if(startLine == endLine) layout.getPrimaryHorizontal(start?: 0) else layout.getLineLeft(endLine),
            layout.getLineTop(endLine).toFloat(),
            layout.getLineLeft(endLine) + layout.width,
            view.item_content.height.toFloat(), Path.Direction.CW)
    }
    c.drawPath(path, paint)
}
```

接下来绘制左右两边的拖动按钮，在`onDrawOver`下面加上，小米的两个`Drawable`并不是正方形，不知道其他的系统是不是一样的：

```kotlin
val selectionHandleLeft = ResourceUtil.resolveDrawableAttr(context, android.R.attr.textSelectHandleLeft)?.also {
    val delta = (it.intrinsicWidth - it.intrinsicHeight) / 2
    it.setBounds(-it.intrinsicWidth + delta, 0, delta,  it.intrinsicHeight)
}
val selectionHandleRight = ResourceUtil.resolveDrawableAttr(context, android.R.attr.textSelectHandleRight)?.also {
    val delta = (it.intrinsicWidth - it.intrinsicHeight) / 2
    it.setBounds(- delta, 0, it.intrinsicWidth - delta,  it.intrinsicHeight)
}

bookLayoutManager.findViewByPosition(startIndex)?.let {
    val pos = textSelectionAdapter.getHandlePosition(it, selectStart.pos)
    c.save()
    c.translate(pos.x.toFloat(), pos.y.toFloat())
    selectionHandleLeft?.draw(c)
    c.restore()
}
bookLayoutManager.findViewByPosition(endIndex)?.let {
    val pos = textSelectionAdapter.getHandlePosition(it, selectEnd.pos)
    c.save()
    c.translate(pos.x.toFloat(), pos.y.toFloat())
    selectionHandleRight?.draw(c)
    c.restore()
}
```
`getHandlePosition`返回对应文字位置的坐标：

```kotlin
val point = Point()
override fun getHandlePosition(view: View, offset: Int): Point {
    if (view.content_container.visibility != View.VISIBLE) return point.also { it.set(-1000, -1000) }
    val layout = view.item_content.layout?: return point.also { it.set(-1000, -1000) }
    view.item_content.getLocationInWindow(posContent)
    return point.also { it.set(
        (layout.getPrimaryHorizontal(offset) + posContent[0] - recyclerView.x).toInt(),
        (layout.getLineBottom(layout.getLineForOffset(offset)) - view.item_content.lineSpacingExtra + posContent[1] - recyclerView.y).toInt()) }
}
```

两个按钮要能点击，在`onTouchEvent`中补上，如果按下的位置在按钮范围内，就把状态设为真，并且把按下的位置设为end，另一个是start，做为锚点：

```kotlin
var handleOffset = 0
private fun checkTouchHandle(e: MotionEvent): Boolean {
    val (startPair, endPair) = getSelectRange()?: return false
    val (startIndex, selectStart) = startPair
    val (endIndex, selectEnd) = endPair
    val textHeight = textSelectionAdapter.getTextHeight()
    bookLayoutManager.findViewByPosition(startIndex)?.let {
        val bounds = selectionHandleLeft?.bounds?: return false
        val pos = textSelectionAdapter.getHandlePosition(it, selectStart.pos)
        if (Rect(pos.x + bounds.left,
                 pos.y  + bounds.top - textHeight,
                 pos.x + bounds.right,
                 pos.y + bounds.bottom + bounds.height() / 2
                ).contains(e.x.toInt(), e.y.toInt())) {
            this.selectStart = selectEnd
            this.selectEnd = selectStart
            handleOffset = (e.y - pos.y).roundToInt() + textHeight / 2
            return true
        }
    }
    bookLayoutManager.findViewByPosition(endIndex)?.let {
        val bounds = selectionHandleRight?.bounds?: return false
        val pos = textSelectionAdapter.getHandlePosition(it, selectEnd.pos)
        if (Rect(pos.x + bounds.left,
                 pos.y  + bounds.top - textHeight,
                 pos.x + bounds.right,
                 pos.y + bounds.bottom + bounds.height() / 2
                ).contains(e.x.toInt(), e.y.toInt())) {
            this.selectStart = selectStart
            this.selectEnd = selectEnd
            handleOffset = (e.y - pos.y).roundToInt() + textHeight / 2
            return true
        }
    }
    return false
}

override fun onTouchEvent(e: MotionEvent): Boolean {
    if (!isActive && e.actionMasked == MotionEvent.ACTION_DOWN) {
        isActive = checkTouchHandle(e)
        hideActionMode()
    }
    (...)
}
```

#### 交互菜单

先做个复制和分享的，这样显示出来并不是小米而是原生的样式：

```kotlin
@RequiresApi(Build.VERSION_CODES.M)
abstract class SelectableActionMode: ActionMode.Callback2() {

    override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
        mode.title = null
        mode.subtitle = null
        mode.titleOptionalHint = true
        populateMenuWithItems(menu)
        return true
    }

    private fun populateMenuWithItems(menu: Menu) {
        menu.add(
            Menu.NONE, ID_COPY, MENU_ITEM_ORDER_COPY,
            "复制"
        ).setAlphabeticShortcut('c').setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
        menu.add(
            Menu.NONE, ID_SHARE, MENU_ITEM_ORDER_SHARE,
            "分享"
        ).setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM)
    }

    override fun onPrepareActionMode(mode: ActionMode?, menu: Menu?): Boolean {
        return true
    }

    override fun onDestroyActionMode(mode: ActionMode?) {
    }

    companion object {
        const val ID_COPY = android.R.id.copy
        const val ID_SHARE = android.R.id.shareText
        private const val MENU_ITEM_ORDER_COPY = 5
        private const val MENU_ITEM_ORDER_SHARE = 7
    }
}
```

在`RecyclerView`里实例化

```kotlin
private val actionModeCallback = object: SelectableActionMode() {
    val clipboardManager by lazy { context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager }

    override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
        val (startPair, endPair) = getSelectRange()?: return false
        val (startIndex, selectStart) = startPair
        val (endIndex, selectEnd) = endPair
        val str = (adapter as? TextSelectionAdapter)?.getSelectionText(startIndex, endIndex, selectStart.pos, selectEnd.pos)?: ""
        when(item.itemId) {
            ID_COPY -> {
                clipboardManager.setPrimaryClip(ClipData.newPlainText("novel_content", str))
                Toast.makeText(App.app.host, "已复制到剪贴板", Toast.LENGTH_LONG).show()
            }
            ID_SHARE -> AppUtil.shareString(context, str)
        }
        hideActionMode()
        return true
    }

    override fun onGetContentRect(mode: ActionMode?, view: View?, outRect: Rect) {
        super.onGetContentRect(mode, view, outRect)
        val (startPair, endPair) = getSelectRange()?: return
        val (startIndex, selectStart) = startPair
        val (endIndex, selectEnd) = endPair
        val firstVisibleSelectPos = Math.max(startIndex, bookLayoutManager.findFirstVisibleItemPosition())
        val lastVisibleSelectPos = Math.min(endIndex, bookLayoutManager.findLastVisibleItemPosition())
        var left = -1
        var right = -1
        val textHeight = textSelectionAdapter.getTextHeight()
        val top = when {
            startIndex < firstVisibleSelectPos -> 0
            startIndex > lastVisibleSelectPos -> this@SelectableRecyclerView.height
            else -> bookLayoutManager.findViewByPosition(startIndex)?.let {
                val p = textSelectionAdapter.getHandlePosition(it, selectStart.pos)
                left = p.x
                p.y - textHeight
            }?: 0
        }
        val bottom = when {
            endIndex < firstVisibleSelectPos -> 0
            endIndex > lastVisibleSelectPos -> this@SelectableRecyclerView.height
            else -> bookLayoutManager.findViewByPosition(endIndex)?.let {
                val p = textSelectionAdapter.getHandlePosition(it, selectEnd.pos)
                right = if(p.x < 0) this@SelectableRecyclerView.width else p.x
                bookLayoutManager.getDecoratedTop(it).coerceAtLeast(p.y)
            }?: 0
        }
        if(left > 0 && right > 0 && top + textHeight == bottom) {
            outRect.set(left, top, right, bottom)
        } else {
            outRect.set(0, top, this@SelectableRecyclerView.width, bottom)
        }
    }
}
```

`getSelectionText`返回选择的文本：

```kotlin
override fun getSelectionText(startIndex: Int, endIndex: Int, startPos: Int, endPos: Int): String {
    val str = StringBuilder()
    var lastRaw: BookProvider.PageInfo? = null
    var lastStart = 0
    var lastEnd = 0
    for(i in startIndex..endIndex) {
        val item = data.getOrNull(i)?: break
        if(lastRaw != item.rawInfo) {
            if(lastRaw != null) str.append(lastRaw.content?.substring(lastStart, lastEnd) + '\n')
            lastRaw = item.rawInfo
            lastStart = (item.rawRange?.first?:0) + (if(i == startIndex) startPos else 0)
        }
        lastEnd = (item.rawRange?.first?:0) + (if(i == endIndex) endPos else 0)
    }
    str.append(lastRaw?.content?.substring(lastStart, lastEnd))
    return str.toString()
}
```

最后是在`onTouchEvent`中触发显示和隐藏，滚动时也隐藏：

```kotlin
fun showActionMode() {
    actionMode = startActionMode(actionModeCallback, ActionMode.TYPE_FLOATING)
}

fun hideActionMode() {
    actionMode?.finish()
    actionMode = null
}

override fun onTouchEvent(e: MotionEvent): Boolean {
    if (!isActive && e.actionMasked == MotionEvent.ACTION_DOWN) {
        isActive = checkTouchHandle(e)
        hideActionMode()
    }
    if (!isActive) return super.onTouchEvent(e)
    when (e.actionMasked) {
        (...)
        MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
            //结束滑动选择，初始化各状态值
            reset()
            showActionMode()
        }

    }
    return true
}

init {
    addOnScrollListener(object : RecyclerView.OnScrollListener() {
        override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
            if (newState == SCROLL_STATE_IDLE && selectStart != null) {
                showActionMode()
            } else {
                hideActionMode()
            }
            return super.onScrollStateChanged(recyclerView, newState)
        }
    })
}
```

[完整代码传送门](https://github.com/ekibun/BangumiPlugin/tree/master/app/src/main/java/soko/ekibun/bangumi/plugins/ui/view/SelectableRecyclerView.kt)