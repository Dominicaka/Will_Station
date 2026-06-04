const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Datastore = require('nedb-promises');

// 1. 初始化 Windows 默认数据存储位置下的数据库文件
// 实际路径通常为：C:\Users\用户名\AppData\Roaming\will-station\data\
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'data', 'tasks.db');
const configPath = path.join(userDataPath, 'data', 'config.json');

// 确保文件夹存在
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = Datastore.create({ filename: dbPath, autoload: true });

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1020,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'public/logo/app_logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // 安全沙箱预加载
    }
  });

  // 隐藏顶部原生菜单栏，维持高颜值 UI
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'public/index.html'));
}

// 2. 处理前端 IPC 通信（替代原后端的 Go + SQLite 路由）

// 初始化数据读取
ipcMain.handle('api-init', async () => {
  try {
    const tasks = await db.find({});
    let config = { theme: 'light', lang: 'zh', focusSubtitle: '' };
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    return { tasks, config };
  } catch (err) {
    return null;
  }
});

// 保存配置
ipcMain.handle('api-config', async (event, configObj) => {
  fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2), 'utf8');
  return { status: 'success' };
});

// 新增任务
ipcMain.handle('api-add-task', async (event, { text, date }) => {
  const newTask = {
    id: "task_" + Date.now() + Math.random().toString(36).substr(2, 5),
    text,
    date,
    completed: false,
    marked: false,
    isDeleted: false
  };
  await db.insert(newTask);
  const tasks = await db.find({});
  return { status: 'success', tasks };
});

// 更新任务（包含修改日期、勾选状态、星标、软删除）
ipcMain.handle('api-update-task', async (event, id, updateFields) => {
  await db.update({ id: id }, { $set: updateFields });
  const tasks = await db.find({});
  return { status: 'success', tasks };
});

// 彻底物理删除
ipcMain.handle('api-delete-task', async (event, id) => {
  await db.remove({ id: id });
  const tasks = await db.find({});
  return { status: 'success', tasks };
});

// 重置所有数据
ipcMain.handle('api-reset', async () => {
  await db.remove({}, { multi: true });
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
  return { status: 'success' };
});

// 物理备份导出为 CSV
ipcMain.handle('api-export', async (event, lang) => {
  const tasks = await db.find({});
  let csvContent = lang === 'zh' ? "\uFEFFID,内容,日期,是否完成,是否星标,是否删除\n" : "ID,Content,Date,Completed,Marked,Deleted\n";
  
  tasks.forEach(t => {
    csvContent += `"${t.id}","${t.text.replace(/"/g, '""')}","${t.date}",${t.completed},${t.marked},${t.isDeleted}\n`;
  });

  const downloadFolder = app.getPath('downloads');
  const fileFullPath = path.join(downloadFolder, `will_station_backup_${Date.now()}.csv`);
  fs.writeFileSync(fileFullPath, csvContent, 'utf8');
  return { status: 'success', path: fileFullPath };
});

app.whenReady().then(() => {
  // 3. 建立桥接沙箱脚本 preload.js
  const preloadCode = `
    const { contextBridge, ipcRenderer } = require('electron');
    contextBridge.exposeInMainWorld('electronAPI', {
      init: () => ipcRenderer.invoke('api-init'),
      saveConfig: (config) => ipcRenderer.invoke('api-config', config),
      addTask: (data) => ipcRenderer.invoke('api-add-task', data),
      updateTask: (id, fields) => ipcRenderer.invoke('api-update-task', id, fields),
      deleteTask: (id) => ipcRenderer.invoke('api-delete-task', id),
      reset: () => ipcRenderer.invoke('api-reset'),
      exportData: (lang) => ipcRenderer.invoke('api-export', lang)
    });
  `;
  fs.writeFileSync(path.join(__dirname, 'preload.js'), preloadCode, 'utf8');

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});