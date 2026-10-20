"""打包 Chrome 與 Firefox 版。

用法（在專案根目錄）：python tools/build.py
產出 dist/a-ji-compile-v{版本}.zip（Chrome / Brave / Edge，解壓縮後「載入未封裝項目」）
與 dist/a-ji-compile-firefox-v{版本}.zip（上傳到 addons.mozilla.org 簽署用）。

兩版共用同一份程式碼，只有 manifest 不同：Firefox 不支援 background.service_worker，
改用 background.scripts（事件頁），另外需要 gecko id 與資料收集聲明。
"""

import json
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

# 不放進安裝包的檔案（說明文件、截圖、打包腳本）
EXCLUDE_PREFIXES = ("docs/", "tools/", "dist/", ".git")
EXCLUDE_NAMES = {"README.md"}

FIREFOX_SETTINGS = {
    "gecko": {
        "id": "a-ji-compile@taitungsun",
        "strict_min_version": "140.0",
        # 文章內容會送到 Google Gemini 翻譯
        "data_collection_permissions": {"required": ["websiteContent"]},
    }
}


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    for name in out.splitlines():
        if name.startswith(EXCLUDE_PREFIXES) or name in EXCLUDE_NAMES:
            continue
        if name.startswith("RELEASE_") or name == "manifest.json":
            continue
        yield name


def firefox_manifest(manifest):
    m = dict(manifest)
    m["background"] = {"scripts": [manifest["background"]["service_worker"]]}
    m["browser_specific_settings"] = FIREFOX_SETTINGS
    return m


def write_zip(path, manifest, prefix=""):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            prefix + "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        )
        for name in tracked_files():
            zf.write(ROOT / name, prefix + name)
    print(path.relative_to(ROOT))


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    DIST.mkdir(exist_ok=True)
    # Chrome 版包一層資料夾，解壓縮後直接選那個資料夾載入
    write_zip(DIST / f"a-ji-compile-v{version}.zip", manifest, prefix="a-ji-compile/")
    # Firefox 版 manifest.json 必須在 zip 根目錄
    write_zip(DIST / f"a-ji-compile-firefox-v{version}.zip", firefox_manifest(manifest))


if __name__ == "__main__":
    sys.exit(main())
