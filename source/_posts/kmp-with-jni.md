---
title: 在kotlin multiplatform里使用jni
date: 2021-03-17 20:48:46
tags:
  - kotlin multiplatform
  - jetbran compose
  - jni
---

折腾了小半年flutter，感觉还是kotlin写的舒服，听说jb公司的compose能在桌面端跑了，就下了demo试了下，无奈桌面端不能像android一样编译jni库。百度了半天，只有[这个教程](https://medium.com/kodein-koders/native-dependency-in-kotlin-multiplatform-part-2-jni-for-jvm-android-c7a2a44898ad)能用，但代码并不全，要改改才能用。

<!--more-->

#### 桌面端

首先整个cmd编译C++，在gradle里运行shell命令也太麻烦了：

```bat
@echo off

call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
set BUILD_DIR=./.cxx
cmake -S %~dp0/../cxx -B %BUILD_DIR%
cmake --build %BUILD_DIR% --config Release
```

接下来在gradle里整个task调用这个cmd：

```kotlin
tasks.create<Exec>("buildJniNativeWindows") {
  group = "build"

  inputs.dir(rootDir.resolve("cxx"))
  outputs.dir(projectDir.resolve(".cxx/Release"))

  workingDir(projectDir)
  executable = "cmd"
  args("/C", "build-windows.cmd")
}
```

然后在jvm编译的时候调用：

```kotlin
kotlin {
  jvm {
    withJava()

    val processResources = compilations["main"].processResourcesTaskName
    (tasks[processResources] as ProcessResources).apply {
        onlyIf { currentOs.isWindows }
        dependsOn("buildJniNativeWindows")
        from(projectDir.resolve(".cxx/Release"))
    }
  }
  ...
}
```

压根没看懂。调了半天算是猜到了`.cxx/Release`是C++的dll生成的位置，gradle会把这个文件夹的文件全拷贝到资源文件里面。

但是资源文件里的dll并不能被`System.loadLibrary()`调用，所以还得在桌面端实现从资源文件加载dll的代码：

```kotlin
actual fun jniLoadLibrary(name: String) {
  val fname = name + ".dll"
  val ins = object {}::class.java.getResourceAsStream(fname)
  val file = java.io.File(System.getProperty("java.io.tmpdir") + "/" + fname)
  val fos = file.outputStream()
  ins.copyTo(fos)
  ins.close()
  fos.close()
  System.load(file.toString())
}
```

而对应的android端代码就直接：

```kotlin
actual fun jniLoadLibrary(name: String) {
  System.loadLibrary(name)
}
```

#### 安卓端

安卓端就简单了，直接在gradle里加：

```kotlin
android {
  ...
  externalNativeBuild {
    cmake {
      setPath("$rootDir/cxx/CMakeLists.txt")
    }
  }
}
```