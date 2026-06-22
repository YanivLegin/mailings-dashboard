#!/bin/bash

# Color definitions
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0;37m' # No Color

echo -e "${CYAN}=== התחלת תהליך הכנה לפרסום ב-GitHub Pages ===${NC}\n"

# 1. Create .gitignore if it doesn't exist
echo -e "${YELLOW}[1/4] יוצר קובץ .gitignore...${NC}"
cat << 'EOF' > .gitignore
# Ignore python scripts
generate_dashboard_data.py
inspect_data.py
inspect_details.py
clean_inspect.py
parse_recipients.py
test_holidays.py
inspect_high_opens.py
inspect_admin_insights.py

# Ignore source data
דיוורים לפי קטגוריות.xlsx

# OS generated files
.DS_Store
.DS_Store?
ehthumbs.db
Icon?
Thumbs.db
EOF
echo -e "${GREEN}קובץ .gitignore נוצר בהצלחה.${NC}\n"

# 2. Initialize git repository
echo -e "${YELLOW}[2/4] מאתחל מאגר Git מקומי...${NC}"
if [ -d .git ]; then
    echo -e "מאגר Git כבר קיים בתיקייה."
else
    git init -b main
    echo -e "${GREEN}מאגר Git אותחל בהצלחה.${NC}"
fi
echo ""

# 3. Add files and commit
echo -e "${YELLOW}[3/4] מוסיף קבצים ומבצע Commit מקומי...${NC}"
git add index.html style.css app.js data.json .gitignore
git commit -m "Initial commit of Mailings Administrative Dashboard"
echo -e "${GREEN}הקבצים נוספו ובוצע Commit בהצלחה.${NC}\n"

# 4. Instructions for pushing
echo -e "${YELLOW}[4/4] הוראות חיבור ל-GitHub שלך:${NC}"
echo -e "כדי לפרסם את האתר ב-GitHub Pages שלך, בצע את הצעדים הבאים:\n"

echo -e "${CYAN}צעד א:${NC} היכנס לכתובת ${CYAN}https://github.com/new${NC} וצור רפוזיטורי חדש וריק בשם ${GREEN}mailings-dashboard${NC} (אל תוסיף README או .gitignore בשלב היצירה)."
echo -e "${CYAN}צעד ב:${NC} העתק והרצץ את הפקודות הבאות בטרמינל שלך כדי לחבר את התיקייה ל-GitHub ולדחוף את הקוד:"
echo -e "--------------------------------------------------------"
echo -e "  git remote add origin https://github.com/YanivLegin/mailings-dashboard.git"
echo -e "  git branch -M main"
echo -e "  git push -u origin main"
echo -e "--------------------------------------------------------\n"

echo -e "${CYAN}צעד ג:${NC} לאחר הדחיפה (Push), היכנס להגדרות הרפוזיטורי ב-GitHub (Settings) -> ${CYAN}Pages${NC}."
echo -e "תחת ${CYAN}Build and deployment${NC}, בחר ב-Source: ${GREEN}Deploy from a branch${NC}."
echo -e "תחת Branch, בחר ב-${GREEN}main${NC} ותיקיית ${GREEN}/ (root)${NC}, ולחץ על ${CYAN}Save${NC}."
echo -e "תוך דקה, האתר שלך יהיה זמין לכולם בכתובת:"
echo -e "👉 ${GREEN}https://YanivLegin.github.io/mailings-dashboard/${NC}\n"

echo -e "${GREEN}=== סיימנו! הפרויקט מוכן לדחיפה ל-GitHub! ===${NC}"
EOF
