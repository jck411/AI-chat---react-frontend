


fuser -k 8000/tcp

git add .

git commit -m "comment" 
git push origin master

git stash                     # Optional: Stash local changes

git fetch origin              # Fetch latest changes
git checkout master           # Switch to master branch
git reset --hard origin/master # Reset to remote master

git clean -fd                 # Optional: Remove untracked files
git stash pop                 # Optional: Reapply stashed changes


git reset --hard HEAD
git clean -f

from root
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

npm run electron-start




export PYTHONPATH=$(pwd)
/home/jack/aaaVENVs/aihome/bin/python3 backend/main.pys


export PYTHONPATH=/home/jack/ayyaihome
python /home/jack/ayyaihome/backend/main.py


from backend.config import *

