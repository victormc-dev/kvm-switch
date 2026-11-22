#!/bin/bash
# 自动发版：版本号 patch +1 → 编译 → git 提交 → 推送 GitHub
#
# 用法：
#   bash auto-release.sh                        # 默认 commit message
#   bash auto-release.sh "fix: 修复某某bug"     # 自定义 commit message
#   bash auto-release.sh "msg" --no-push        # 只提交不推送
#
# 版本号只递增 patch 位（1.0.0 → 1.0.1），用 npm version --no-git-tag-version
# 同时更新 package.json 与 package-lock.json，且不自动生成 tag/commit，
# 由本脚本统一 commit，保证版本号与代码在同一个提交里。

set -e
cd "$( dirname "${BASH_SOURCE[0]}" )"

MSG="${1:-}"
NO_PUSH=0
for arg in "$@"; do
  [ "$arg" = "--no-push" ] && NO_PUSH=1
done

# 1. 版本号 patch +1
OLD=$(node -p "require('./package.json').version")
NEW=$(node -e "const v=require('./package.json').version.split('.'); v[2]=String(Number(v[2])+1); console.log(v.join('.'))")
npm version "$NEW" --no-git-tag-version >/dev/null
echo "版本号: $OLD → $NEW"

# 2. 编译
echo "=== 编译 ==="
npm run build

# 3. 提交
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
    python "$PUSH_SCRIPT" -b main
  else
    echo "跳过推送：未找到 $PUSH_SCRIPT"
  fi
fi

echo "=== 完成：v$NEW ==="
