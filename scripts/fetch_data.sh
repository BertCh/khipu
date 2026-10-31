#!/usr/bin/env bash
# Fetch the two raw khipu data sources into data/.
#   data/okr/        Open Khipu Repository (git clone; khipu.db lives at data/okr/data/khipu.db)
#   data/kfg/xlsx/   Khipu Field Guide workbooks, one per khipu
# Then run:  python3 scripts/build_data.py   (needs: pip install openpyxl)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/kfg/xlsx

if [ ! -d data/okr/.git ]; then
  git clone --depth 1 https://github.com/khipulab/open-khipu-repository.git data/okr
else
  git -C data/okr pull --ff-only
fi

# The KFG publishes one xlsx per khipu at a predictable URL but no index of them,
# so probe the KH number range and keep whatever exists.
KFG=https://www.khipufieldguide.com/databook/excel_khipus
seq -f "KH%04g" 1 800 | xargs -P 12 -I{} sh -c \
  'code=$(curl -s -o /dev/null -w "%{http_code}" -I "'"$KFG"'/{}.xlsx"); [ "$code" = "200" ] && echo {}' \
  | sort -u > data/kfg/kh_ids.txt
echo "found $(wc -l < data/kfg/kh_ids.txt) KFG workbooks"

xargs -P 12 -I{} curl -s -f -o "data/kfg/xlsx/{}.xlsx" "$KFG/{}.xlsx" < data/kfg/kh_ids.txt
curl -s -f -o data/kfg/KFG_Template.xlsx https://khipufieldguide.com/databook/KFG_Template.xlsx
echo "downloaded $(ls data/kfg/xlsx | wc -l) workbooks"
