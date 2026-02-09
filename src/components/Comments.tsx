import * as React from 'react';
import Giscus from '@giscus/react';

const id = 'inject-comments';

function getSavedTheme() {
  return window.localStorage.getItem('theme') ?? 'light'
}

// 获取系统主题
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const Comments = () => {
  const [mounted, setMounted] = React.useState(false);

  const [theme, setTheme] = React.useState('light')

  React.useEffect(() => {
    const theme = getSavedTheme() || getSystemTheme()
    setTheme(theme)
    const observer = new MutationObserver(() => {
      setTheme(getSavedTheme())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    // 取消监听
    return () => {
      observer.disconnect()
    }
  }, [])

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div id={id} className="w-full">
      {mounted ? (
        <Giscus
          id={id}
          repo="orangeboyChen/blog"
          repoId="R_kgDORMJ3yQ"
          category="Comments"
          categoryId="DIC_kwDORMJ3yc4C2GZo"
          mapping="title"
          reactionsEnabled="1"
          emitMetadata="0"
          inputPosition="top"
          lang="zh-CN"
          loading="lazy"
          theme={theme}
        />
      ) : null}
    </div>
  );
};

export default Comments;
