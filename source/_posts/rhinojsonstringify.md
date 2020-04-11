---
title: Rhino与Android的互操作
date: 2020-04-11 21:05:31
tags:
	- android
---

Rhino作为基于Java的JavaScript实现，可以方便地在Android中运行JavaScript脚本。这里记录一下相互调用的一些问题。

<!--more-->

#### JSON序列化

为了便于互操作，JavaScript和Java的数据均以JSON字符串进行交换。而Rhino的`JSON.stringify`和Java的数据类型不兼容，对Java类型的变量操作会出现循环，同样的，用于序列化Java数据类型的Gson库也不支持Rhino的JavaScript数据类型。

仿照解决`JSON.stringify`的方法，判断变量是否为Java对象，是则调用Gson进行转换：

```javascript
function handleCircular() {
   var cache = []
   var keyCache = []
   return (key, value) => {
       if(value instanceof Packages.java.lang.Object) {
           return JSON.parse(Packages.${JsonUtil.javaClass.name}.INSTANCE.toJson(value));
       }
       if (typeof value === 'object' && value !== null) {
           var index = cache.indexOf(value);
           if (index !== -1) return '[Circular ' + keyCache[index] + ']'
           cache.push(value)
           keyCache.push(key || 'root')
       }
       return value
   }
}

var tmp = JSON.stringify;
JSON.stringify = function(value, replacer, space) {  
   replacer = replacer || handleCircular();
   return tmp(value, replacer, space);
}
```

#### 异步线程

Rhino没有实现`async`和`await`。借助Java线程池实现异步，先写个带参数的`Callable`：

```kotlin
class JsAsyncTask(val js: (Any?) -> Any?, private val params: Any?) : Callable<Any?> {
    override fun call(): Any? {
        return js(params)
    }
}
```

`async`返回闭包函数，创建`callable`，加入线程池并返回`Future`：

```javascript
var AsyncTask = Packages.${JsAsyncTask::class.java.name};
var _cachedThreadPool = Packages.${App::class.java.name}.Companion.getCachedThreadPool();

function async(fun){
   return (param)=>{
       var task = new AsyncTask(function(params){ try { return JSON.stringify(fun(params)) } catch(e){ return new Error(e) } }, param)
       return _cachedThreadPool.submit(task)
   }
}
```

为了看起来像，再包个`await`，把`async`里`stringify`的转回来：

```javascript
function await(task){
   var data = task.get()
   if(data instanceof Error) throw data.message
   return JSON.parse(data)
}
```

