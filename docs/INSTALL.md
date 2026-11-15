# 下载、安装与更新

## 推荐下载方式

点击 **[下载扩展安装包](https://github.com/Patrick9527/weibo-time-archive/raw/refs/heads/main/downloads/weibo-time-archive-v0.1.0.zip)**。这是给普通用户使用的 ZIP，不需要安装任何开发工具。

也可在 [项目首页](https://github.com/Patrick9527/weibo-time-archive) 打开 `downloads` 文件夹，选择对应版本 ZIP，点击 GitHub 的下载原始文件按钮。

## Mac 和 Windows 安装步骤

1. 双击 ZIP 解压。Windows 也可右键选择“全部解压缩”。
2. 把解压出的 `weibo-time-archive-extension` 文件夹放在一个固定位置。
3. 在 Chrome 地址栏输入 `chrome://extensions`。
4. 打开右上角“开发者模式”。
5. 点击左上角“加载已解压的扩展程序”。
6. 选择 `weibo-time-archive-extension`，其中应直接有 `manifest.json`。
7. 看见“微博时光档案”扩展卡片且没有加载错误，即完成安装。
8. 点击浏览器右上角拼图菜单，再点击工具旁的图钉，固定图标。

**Mac 找不到文件夹？** 在选择窗口按 `⌘ ⇧ G`，粘贴该文件夹的本机路径，按回车，再点“选择”。其他人的本机路径与你不同，不要使用教程作者的电脑路径。

**下载了整个源码 ZIP？** 解压后选择项目里的 `extension` 子文件夹，而不是项目根目录。

## 第一次使用

打开 `https://weibo.com/` → 登录 → 在这个微博标签页点击扩展图标 → 核对账号 → 开始备份。

只在工具栏点图标，不要双击扩展目录中的 HTML。扩展 API 在普通文件网页中不可用。

如果工具没有识别登录账号，先刷新微博、打开自己的主页，再点击图标。用户登录、验证码和二次验证在微博自行完成。

## 更新版本

1. 暂停任务，导出 JSON 留作备份。
2. 下载并解压新版本。
3. 将新版本文件覆盖到原扩展安装目录，保持安装目录路径不变。
4. 在 `chrome://extensions` 点击该扩展的重新加载按钮，刷新工作台。

若改用另一个目录重新加载，可能被 Chrome 视为不同扩展，本地数据库不一定沿用；可以导入之前保存的 JSON。不要依靠重装来保留唯一一份档案。

## 下载文件的位置

JSON、HTML 通常在 Chrome 下载目录下的 `微博时光档案/账号UID/`。Chrome 若设置了下载前询问保存位置，请分别确认。可在 `chrome://downloads` 查看实际文件位置和下载状态。

这不是商店版本，无需在其他网站购买安装码，也无需向开发者提供 Cookie 或密码。
