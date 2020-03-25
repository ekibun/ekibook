---
title: 简陋Android插件化方案
date: 2020-03-25 18:02:28
tags:
	- android
---
由于一些不可描述的原因，需要把部分功能从app里独立出来，作为两个独立的apk应用。两个独立的apk进行交互非常麻烦。这里记录一下自己摸索的一个简陋但可行的实现方法。

<!--more-->

#### 插件代码的加载

首先，为了避免跨进程通信，所有代码都由宿主进程统一加载。

首先在插件应用留一个单例的类，在`Application`里实例化这个类，当作插件实例：

```kotlin
fun createPluginInstance(context: Context): Pair<Context, Any>? {
    return try {
        val pluginContext = context.createPackageContext(
            "soko.ekibun.bangumi.plugins",
            Context.CONTEXT_IGNORE_SECURITY or Context.CONTEXT_INCLUDE_CODE
        )
        val pluginClass = pluginContext.classLoader.loadClass("soko.ekibun.bangumi.plugins.Plugin")
        pluginContext to pluginClass.getDeclaredConstructor().let {
            it.isAccessible = true
            it.newInstance()
        }
    } catch (e: Exception) {
        e.printStackTrace()
        null
    }
}
```

然后在`Activity.onCreate`里用反射调用插件的`setupPlugins`函数：

```kotlin
fun setUpPlugins(activity: Activity): Boolean {
    val pluginInstance = App.get(activity).pluginInstance ?: return false
    return try {
        val method =
            pluginInstance.second.javaClass.getMethod("setUpPlugins", Activity::class.java, Context::class.java)
        method.invoke(pluginInstance.second, activity, pluginInstance.first)
        true
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }
}
```

插件就能获得当前的`Activity`和`Context`实例：

```kotlin
@Keep
fun setUpPlugins(activity: Activity, context: Context) {
    App.init(activity.application, context)
    try {
        pluginList[activity.javaClass.name]?.setUpPlugins(WeakReference(activity))
    } catch (e: Exception) {
        Log.e("plugin", Log.getStackTraceString(e))
    }
}
```

这里根据不同的`Activity`的名称，加载对应的类去处理。仿照`Application`模式，在`App.init`里创建一个全局的`App`实例，用来保存宿主和自己的上下文：

```kotlin
class App(val host: Context, val plugin: Context) {
    val handler = android.os.Handler { true }

    companion object {
        val inited get() = ::app.isInitialized

        lateinit var app: App
        fun init(host: Context, plugin: Context) {
            if (!inited) app = App(host, plugin)
        }
    }
}
```

到这里，就已经能运行插件的代码了，接下来是一些坑和解决的办法。

#### 加载插件的布局和样式

由`createPackageContext`创建的上下文是没有样式的，需要根据`Activity`的`Configuration`去创建：

```kotlin
fun createThemeContext(activityRef: WeakReference<Activity>): Context {
    val themeContext = object : ContextThemeWrapper(app.plugin, R.style.AppTheme) {
        override fun getApplicationContext(): Context {
            return this
        }

        override fun getSystemService(name: String): Any? {
            return when (name) {
                Context.WINDOW_SERVICE -> activityRef.get()?.getSystemService(name)
                else -> super.getSystemService(name)
            }
        }
    }
    activityRef.get()?.let { themeContext.applyOverrideConfiguration(it.resources.configuration) }
    return themeContext
}
```

#### 调用宿主的函数

和宿主加载插件一样，可以用反射来调用宿主的函数。直接使用反射有点麻烦，可以创建一个对应类相同的接口，通过`Proxy.newProxyInstance`进行调用，先写个Wrapper：

```kotlin
private fun getLoaderClasses(classLoader: ClassLoader, classes: Array<out Class<*>>): Array<Class<*>> {
    return classes.map {
        if (it.isPrimitive || it.classLoader == classLoader) it
        else classLoader.loadClass(it.name)
    }.toTypedArray()
}

private fun getMethod(clazz: Class<*>, name: String, vararg params: Class<*>): Method? {
    val loaderParams = getLoaderClasses(clazz.classLoader!!, params)
    var type = clazz
    var ret: Method? = null
    do {
        try {
            ret = type.getDeclaredMethod(name, *loaderParams)
        } catch (e: NoSuchMethodException) {}
        if (ret != null) break
        type = type.superclass ?: break
    } while (true)
    ret?.isAccessible = true
    return ret
}

@Suppress("UNCHECKED_CAST")
fun <T> proxyObject(obj: Any?, clazz: Class<T>): T? {
    if (clazz.classLoader == null || obj == null || obj.javaClass == clazz || !clazz.isInterface)
        return obj as? T
    return Proxy.newProxyInstance(
        clazz.classLoader, arrayOf(clazz)
    ) { _, method, args ->
        getMethod(obj.javaClass, method.name, *method.parameterTypes)?.let {
            it.invoke(obj, *(args ?: arrayOf()).mapIndexed { i, v ->
                proxyObject(v, it.parameterTypes[i])
            }.toTypedArray())
        }?.let { proxyObject(it, method.returnType) }
    } as? T
}
```

例如，若宿主的`Application`包含`remoteAction`变量，定义如下接口：

```kotlin
interface IApplication {
    var remoteAction: (intent: Intent?, flags: Int, startId: Int) -> Unit
}
```

调用`proxyObject(host, IApplication::class.java)`，就能像宿主一样访问变量了。

#### 启动服务

服务必须要声明在`AndroidManifest.xml`里，用了个笨方法，先声明：

```xml
<service
        android:name=".RemoteService"
        android:exported="false">
</service>
```

服务里吧`onStartCommand`指向`Application.remoteAction`：

```kotlin
class RemoteService : Service() {

    override fun onBind(intent: Intent): IBinder? {
        return null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        (application as App).remoteAction(intent, flags, startId)
        return super.onStartCommand(intent, flags, startId)
    }
}
```

修改`remoteAction`变量，再启动`RemoteService`就能调用自己的代码了。