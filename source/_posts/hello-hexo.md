---
title: hello hexo
date: 2020-03-15 19:33:16
tags: 
	- hexo
emoji: true
---



第一篇博客，先学学`hexo`吧。。

<!--more-->

安装就不说了。存一下常用命令（摘自[知乎专栏](https://zhuanlan.zhihu.com/p/60578464)）

```bash
hexo new "name"       # 新建文章
hexo new page "name"  # 新建页面
hexo g                # 生成页面
hexo d                # 部署
hexo g -d             # 生成页面并部署
hexo s                # 本地预览
hexo clean            # 清除缓存和已生成的静态文件
hexo help             # 帮助
```

第一件事当然是换主题，先试试第一名的`NexT`

```bash
git clone https://github.com/theme-next/hexo-theme-next themes/next
```

`NexT`官方项目里推荐了下面几个plugins，不管用不用的上先全装了


* :mag_right: [hexo-generator-searchdb](https://github.com/theme-next/hexo-generator-searchdb): Seach data generator plugin for Hexo.

* :tada: [hexo-filter-emoji](https://github.com/theme-next/hexo-filter-emoji): GitHub emojis for Hexo!

* :crystal_ball: [hexo-filter-optimize](https://github.com/theme-next/hexo-filter-optimize): A Hexo plugin that optimize the pages loading speed.

* :100: [hexo-filter-mathjax](https://github.com/stevenjoezhang/hexo-filter-mathjax): Server side MathJax renderer plugin for Hexo.

* :triangular_flag_on_post: [hexo-generator-indexed](https://github.com/stevenjoezhang/hexo-generator-indexed): Index generator plugin with more user-defined options.

最后是一些配置

#### 中文

和`NexT`官网说的`zh-Hans`不一样

```yaml
language: zh-CN
```

#### Github配置

要装上`hexo-deployer-git`，然后修改`_config.yml`

Github page有两种模式，一种是建`username.github.io`的repo，然后部署到`master`分支

```yaml
deploy:
  type: git
  repository: git@github.com:ekibun/ekibun.github.io.git
  branch: master
```

还有一种是发布到repo的`gh-pages`分支：

```yaml
deploy:
  type: git
  repository: git@github.com:ekibun/ekibook.git
  branch: gh-pages
```

#### 保存本地图片

要装上`hexo-asset-image`，然后修改`_config.yml`

```yaml
post_asset_folder: true
```

使用上有两种，一个是建立和页面一样的文件夹，然后用相对路径`page/image.jpg`

另一个是放在`source/images`里面然后用绝对路径`/images/image.jpg`

#### 图标CDN

~~`NexT`默认用的字体要从[FontAwesome](http://www.fontawesome.com.cn/)下载，然后把`fonts`文件夹放到`source`文件夹下面图标才会正常显示~~

加上`fonts`文件夹之后加载会非常慢，不知道为什么原来的cdn死活加不上，换成稳定版的`NexT`之后就行了。把主题的`lib`库删了，全换成cdn：

```yml
fontawesome: //cdn.jsdelivr.net/npm/font-awesome@4/css/font-awesome.min.css
```

#### TAG页面

`hexo new page tags`创建一个页面，然后`index.md`加上`type: "tags"`

```markdown
---
title: tags
date: 2020-03-15 20:43:21
type: "tags"
comments: false
---
```

#### Gitalk评论

先在Github创建一个[OAuth App](https://github.com/settings/developers )，然后在`NexT`里的`_config.yml`把数据填上

```yaml
# Gitalk
# For more information: https://gitalk.github.io, https://github.com/gitalk/gitalk
gitalk:
  enable: true
  github_id: ekibun # GitHub repo owner
  repo: ekibun.github.io # Repository name to store issues
  client_id: *** # GitHub Application Client ID
  client_secret: ***** # GitHub Application Client Secret
  admin_user: ekibun # GitHub repo owner and collaborators, only these guys can initialize gitHub issues
  distraction_free_mode: true # Facebook-like distraction free mode
  # Gitalk's display language depends on user's browser or system environment
  # If you want everyone visiting your site to see a uniform language, you can set a force language value
  # Available values: en | es-ES | fr | ru | zh-CN | zh-TW
  language: zh-CN
```

#### 访客统计

在`NexT`配置文件里把`busuanzi_count`打开就行了

```yaml
# Show Views / Visitors of the website / page with busuanzi.
# Get more information on http://ibruce.info/2015/04/04/busuanzi
busuanzi_count:
  enable: true
```

#### 字数统计

装上插件`hexo-symbols-count-time`直接生效

