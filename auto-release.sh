#!/bin/bash
# 自动发版：版本号 patch +1 → 编译 + 打包 EXE → git 提交 → 推送 GitHub
#
# 用法：
#   bash auto-release.sh                          # 默认 message，完整发版
#   bash auto-release.sh "fix: 修复某某bug"       # 自定义 commit message
#   bash auto-release.sh "msg" --no-package       # 跳过 EXE 打包（只编译）
#   bash auto-release.sh "msg" --no-push          # 提交但不推送
#   bash auto-release.sh "msg" --no-package --no-push
#
# 版本号只递增 patch 位（1.0.1 → 1.0.2），用 npm version --no-git-tag-version
# 同时更新 package.json 与 package-lock.json，且不自动生成 tag/commit，
# 由本脚本统一 commit，保证版本号与代码在同一个提交里。
# 打包复用 build-installer.sh（输出到系统 Temp 再复制回 release，绕过沙箱文件锁）。

set -e
cd "$( dirname "${BASH_SOURCE[0]}" )"

MSG="${1:-}"
NO_PUSH=0
NO_PACKAGE=0
for arg in "$@"; do
  [ "$arg" = "--no-push" ] && NO_PUSH=1
  [ "$arg" = "--no-package" ] && NO_PACKAGE=1
done

# 1. 版本号 patch +1
OLD=$(node -p "require('./package.json').version")
NEW=$(node -e "const v=require('./package.json').version.split('.'); v[2]=String(Number(v[2])+1); console.log(v.join('.'))")
npm version "$NEW" --no-git-tag-version >/dev/null
echo "版本号: $OLD → $NEW"

# 2. 编译 + 打包 EXE（build-installer.sh 内含 npm run build，不重复编译）
if [ "$NO_PACKAGE" = "0" ]; then
  echo "=== 编译 + 打包 EXE ==="
  bash build-installer.sh
else
  echo "=== 编译（跳过打包） ==="
  npm run build
fi

# 3. 提交（源码 + 版本号；release/ 已被 .gitignore 排除，EXE 不进 git）
[ -z "$MSG" ] && MSG="chore: bump version to $NEW"
echo "=== 提交 ==="
git add -A
git commit -m "$MSG"
echo "commit: $(git log -1 --oneline)"

# 4. 推送 GitHub（用无阻塞脚本，避免 credential helper 挂死）
if [ "$NO_PUSH" = "0" ]; then
  PUSH_SCRIPT="C:/Users/ASUS/.workbuddy/skills/git-push-no-hang/scripts/git_push.py"
  if [ -f "$PUSH_SCRIPT" ]; then
    echo "=== 推送 GitHub ==="
    # 本机代理偶发 502，先常规推；失败则清掉代理环境变量直连重试
    if ! python "$PUSH_SCRIPT" -b main; then
      echo "代理推送失败，尝试绕过代理直连..."
      env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
        python "$PUSH_SCRIPT" -b main
    fi
  else
    echo "跳过推送：未找到 $PUSH_SCRIPT"
  fi
fi

echo "=== 完成：v$NEW ==="
echo "EXE 产物：$(ls release/*.exe 2>/dev/null | tr '\n' ' ')"
