---
title: windows下静态编译android端ffmpeg
date: 2021-03-17 21:37:28
tags:
  - ffmpeg
  - android
---

研究视频播放，用到了ffmpeg的库，在windows下进行交叉编译真是太麻烦了，windows端按照[官方教程](https://github.com/microsoft/FFmpegInterop)还算顺利，但安卓端的教程没一个能用的，最后参考[这个代码](https://github.com/binglingziyu/ffmpeg-android-build)才编译成功，记录一下过程：

<!--more-->

参考微软官方教程，先写个shell，这里根据不同平台设置不同的参数：

```bash
#!/bin/bash

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

pushd $DIR

abi="$1_$2"

if [ -d build/$abi ]; then
  rm -r build/$abi
fi
mkdir -p build/$abi

cd build/$abi

COMMON_CONFIG="\
  --disable-programs \
  --disable-encoders \
  --disable-muxers \
  --disable-avdevice \
  --disable-protocols \
  --disable-doc \
  --disable-filters \
  --disable-avfilter \
  --enable-static \
  --enable-cross-compile \
  --prefix=./ \
"

case $1 in
  "win32")
    INCLUDE="$JAVA_HOME\include;$INCLUDE"
    LIB="$JAVA_HOME\lib;$LIB"
    ../../ffmpeg/configure \
      $COMMON_CONFIG \
      --arch=$2 \
      --target-os=$1 \
      --toolchain=msvc \
      --disable-d3d11va \
      --disable-dxva2 \
      --extra-cflags="-MD -DWINAPI_FAMILY=WINAPI_FAMILY_APP -D_WIN32_WINNT=0x0A00" \
      --extra-ldflags="-APPCONTAINER WindowsApp.lib"
    ;;
  "android")
    MIN_PLATFORM="$ANDROID_NDK_HOME/platforms/android-21"
    TOOLCHAIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/windows-x86_64"
    case $2 in
      "arm")
        CC_PREFIX="$TOOLCHAIN/bin/armv7a-linux-androideabi21"
        CROSS_PREFIX="$TOOLCHAIN/bin/arm-linux-androideabi-"
        ;;
      "arm64")
        CC_PREFIX="$TOOLCHAIN/bin/aarch64-linux-android21"
        CROSS_PREFIX="$TOOLCHAIN/bin/aarch64-linux-android-"
        ;;
      "x86")
        CC_PREFIX="$TOOLCHAIN/bin/i686-linux-android21"
        CROSS_PREFIX="$TOOLCHAIN/bin/i686-linux-android-"
        ;;
      "x86_64")
        CC_PREFIX="$TOOLCHAIN/bin/x86_64-linux-android21"
        CROSS_PREFIX="$TOOLCHAIN/bin/x86_64-linux-android-"
        ;;
      *)
        exit 1
    esac
    ../../ffmpeg/configure \
      $COMMON_CONFIG \
      --arch=$2 \
      --target-os=$1 \
      --cc=$CC_PREFIX-clang \
      --cxx=$CC_PREFIX-clang++ \
      --cross-prefix=$CROSS_PREFIX \
      --enable-jni \
      --disable-asm \
      --extra-cflags="-Os -fpic -DANDROID" \
      --extra-ldflags="-Wl,-rpath-link=$MIN_PLATFORM/arch-arm/usr/lib -nostdlib -fPIC"
    sed -i "s/#define HAVE_INET_ATON 0/#define HAVE_INET_ATON 1/" config.h
    sed -i "s/#define getenv(x) NULL/\\/\\/ #define getenv(x) NULL/" config.h
    ;;
  *)
    exit 1
esac
if [ "$1" == "win32" ]; then
  toolchain='msvc'
  extracflags="-MD -DWINAPI_FAMILY=WINAPI_FAMILY_APP -D_WIN32_WINNT=0x0A00"
  extraldflags="-APPCONTAINER WindowsApp.lib"
fi

make -j8
make install

popd
```

然后写个cmd运行msys：

```bat
@echo off

set MSYS2_PATH_TYPE=inherit

set ANDROID_NDK_HOME=C:/Users/ekibun/AppData/Local/Android/Sdk/ndk/21.4.7075529
"C:\msys64\usr\bin\bash.exe" --login -x %~dp0ffmpeg.config.sh android arm
"C:\msys64\usr\bin\bash.exe" --login -x %~dp0ffmpeg.config.sh android arm64
"C:\msys64\usr\bin\bash.exe" --login -x %~dp0ffmpeg.config.sh android x86
"C:\msys64\usr\bin\bash.exe" --login -x %~dp0ffmpeg.config.sh android x86_64

call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
"C:\msys64\usr\bin\bash.exe" --login -x %~dp0ffmpeg.config.sh win32 x86_64
call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x86
"C:\msys64\usr\bin\bash.exe" --login -x %~dp0ffmpeg.config.sh win32 x86
```

在CMakeLists.txt里针对不同平台链接不同的静态库：

```cmake
cmake_minimum_required(VERSION 3.7 FATAL_ERROR)

project(ffmpeg LANGUAGES CXX)
add_library(ffmpeg SHARED
  ${CMAKE_CURRENT_LIST_DIR}/ffmpeg.cpp
)

if (ANDROID)
  set(FFMPEG_PATH "${CMAKE_CURRENT_LIST_DIR}/build/android_${CMAKE_ANDROID_ARCH}")
  set(ffmpeg-lib
    z
  )
endif ()

if (WIN32)
  if (CMAKE_VS_PLATFORM_NAME MATCHES "x64")
    set(FFMPEG_PATH "${CMAKE_CURRENT_LIST_DIR}/build/win32_x86_64")
  else()
    set(FFMPEG_PATH "${CMAKE_CURRENT_LIST_DIR}/build/win32_x86")
  endif ()

  set(ffmpeg-lib
    WindowsApp.lib
  )
endif ()

target_include_directories(ffmpeg PRIVATE "${FFMPEG_PATH}/include")

target_link_libraries(ffmpeg PRIVATE
  ${ffmpeg-lib}
  "${FFMPEG_PATH}/lib/libavformat.a"
  "${FFMPEG_PATH}/lib/libavcodec.a"
  "${FFMPEG_PATH}/lib/libavutil.a"
  "${FFMPEG_PATH}/lib/libswresample.a"
  "${FFMPEG_PATH}/lib/libswscale.a"
)
```

注意这里要带上config里链接的库，不然会找不到符号。