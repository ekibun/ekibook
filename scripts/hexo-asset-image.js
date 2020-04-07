'use strict';
var cheerio = require('cheerio');

hexo.extend.filter.register('after_post_render', function(data){
  const { config } = hexo;
  if(config.post_asset_folder){
    const link = data.permalink.replace(new RegExp(`^${config.url}/|(index\.html)?$`, 'ig'), "");
    console.log(link);
    ['excerpt', 'more', 'content'].forEach((key) => {
      const $ = cheerio.load(data[key], {
        ignoreWhitespace: false,
        xmlMode: false,
        lowerCaseTags: false,
        decodeEntities: false
      });

      $('img').each(function(){
        ['src', 'data-src'].forEach((srcAttr) => {
          if(!$(this).attr(srcAttr)) return
          let src = $(this).attr(srcAttr).replace('\\', '/').trim();
          // skip http url
          if(/^(https?:)?\/\//.test(src)) return
          // replace ../ to config.root
          if(/^\.\.\//.test(src)) src = src.replace(/^\.\.\//, config.root);
          else {
            const srcArray = src.split('/').filter((elem) => elem && elem != '.');
            if(srcArray.length > 1) srcArray.shift();
            src = config.root + link + srcArray.join('/');
          }
          $(this).attr(srcAttr, src);
          console.info&&console.info(`update ${srcAttr} link to:${$(this).attr(srcAttr)}`);
        })
      });
      data[key] = $.html();
    });
  }
});