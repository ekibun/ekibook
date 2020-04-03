---
title: 简陋Android插件化方案（二）插件平台
date: 2020-04-03 10:53:43
tags:
	- android
---

接上一章，既然要搞插件，那就可以不止一个。参考了一下Nevolution的sdk，可以在manifest加个service把插件类暴露给宿主。

<!--more-->

首先是在`AndroidManifest.xml`上注册一个service：

```xml
<service
        android:name=".Plugin"
        android:exported="true"
        tools:ignore="ExportedService">
    <intent-filter>
        <action android:name="soko.ekibun.bangumi.plugins"/>
    </intent-filter>
</service>
```

`Plugin`类继承`Service`，但并不用服务的功能，和原来一样，留一个`setupPlugin`给宿主调用。

宿主中通过`PackageManager.queryIntentServices`来获取插件列表

```kotlin
fun createPluginInstance(context: Context): Map<Context, Any> {
    return context.packageManager.queryIntentServices(
        Intent("soko.ekibun.bangumi.plugins"), 0
    ).distinctBy { it.serviceInfo.packageName }.mapNotNull {
        try {
            val pluginContext = context.createPackageContext(
                it.serviceInfo.packageName,
                Context.CONTEXT_IGNORE_SECURITY or Context.CONTEXT_INCLUDE_CODE
            )
            val pluginClass = pluginContext.classLoader.loadClass(it.serviceInfo.name)
            pluginContext to pluginClass.getDeclaredConstructor().let {
                it.isAccessible = true
                it.newInstance()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }.toMap()
}
```

在`PreferenceFragmentCompat.onBindPreferences`里显示插件列表：

```kotlin
override fun onBindPreferences() {
    super.onBindPreferences()
    if (this.preferenceScreen.key == "pref_plugin") {
        val cat = findPreference<PreferenceCategory>("pref_plugin_list") ?: return
        cat.removeAll()
        App.get(context!!).pluginInstance.forEach { plugin ->
            cat.addPreference(PluginPreference(context, plugin))
        }
    }
}
```

`PluginPreference`继承`SwitchPreference`加上了一个设置按钮：

```kotlin
class PluginPreference(context: Context?, private val plugin: Map.Entry<Context, Any>) : SwitchPreference(context) {

    init {
        val appInfo = plugin.key.applicationInfo
        key = "use_plugin_${plugin.key.packageName}"
        title = plugin.key.getString(appInfo.labelRes)
        icon = plugin.key.applicationInfo.loadIcon(plugin.key.packageManager)
        summary = plugin.key.packageName
        setDefaultValue(true)
        widgetLayoutResource = R.layout.pref_plugin_widget
    }

    override fun onBindViewHolder(holder: PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        holder.itemView.item_settings.setOnClickListener {
            showPreference()
        }
    }

    private fun showPreference() {
        context.startActivity(
            Intent.createChooser(
                Intent("soko.ekibun.bangumi.plugins.setting").setPackage(plugin.key.packageName),
                plugin.key.packageName
            )
        )
    }
}
```

要注意的是插件的`Activity`如果不把`category`设置成`DEFAULT`，宿主没办法隐式调用：

```xml
<activity
        android:name=".ui.setting.SettingsActivity"
        android:label="@string/settings"
        android:exported="true">
    <intent-filter>
        <action android:name="soko.ekibun.bangumi.plugins.setting"/>
        <category android:name="android.intent.category.DEFAULT"/>
    </intent-filter>
</activity>
```