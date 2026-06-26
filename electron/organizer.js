const fs = require('fs');
const path = require('path');

/**
 * 预览整理计划：返回每个分类对应的文件和目标文件夹
 */
function generatePlan(classifiedData, desktopPath) {
  const plan = {};

  for (const [category, items] of Object.entries(classifiedData)) {
    if (category === '未分类' || items.length === 0) continue;

    const folderName = `📦 ${category}`;
    const folderPath = path.join(desktopPath, folderName);

    plan[category] = {
      folderName,
      folderPath,
      exists: fs.existsSync(folderPath),
      items: items.map(item => ({
        name: item.fullName,
        source: item.path,
        target: path.join(folderPath, item.fullName),
      })),
    };
  }

  return plan;
}

/**
 * 执行整理：创建文件夹并移动文件
 * 返回操作结果
 */
async function executePlan(plan, desktopPath) {
  const results = [];

  for (const [category, info] of Object.entries(plan)) {
    // 创建分类文件夹
    if (!info.exists) {
      try {
        fs.mkdirSync(info.folderPath, { recursive: true });
      } catch (err) {
        results.push({
          category,
          success: false,
          error: `创建文件夹失败: ${err.message}`,
        });
        continue;
      }
    }

    // 移动文件
    let moved = 0;
    let failed = 0;
    const errors = [];

    for (const item of info.items) {
      try {
        // 如果目标已存在，先删除
        if (fs.existsSync(item.target)) {
          fs.unlinkSync(item.target);
        }
        fs.renameSync(item.source, item.target);
        moved++;
      } catch (err) {
        failed++;
        errors.push(`${item.name}: ${err.message}`);
      }
    }

    results.push({
      category,
      folderName: info.folderName,
      success: failed === 0,
      moved,
      failed,
      errors,
    });
  }

  return results;
}

function getUniqueTargetPath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  let suffix = 2;
  let candidate = '';
  do {
    candidate = path.join(dir, `${base} (${suffix})${ext}`);
    suffix++;
  } while (fs.existsSync(candidate));
  return candidate;
}

/**
 * 将选中的桌面图标收纳进文件夹
 */
function packItems(packPlan) {
  const results = [];

  for (const group of Array.isArray(packPlan) ? packPlan : []) {
    const category = group.category || '未分类';
    const targetCategory = group.targetCategory || category;
    const folderName = group.folderName || `📦 ${category}`;
    const items = Array.isArray(group.items) ? group.items : [];
    const folders = new Set();
    const errors = [];
    let moved = 0;
    let failed = 0;

    for (const item of items) {
      const source = item?.source;
      if (!source) continue;

      const sourceDir = path.dirname(source);
      const folderPath = path.join(sourceDir, folderName);
      folders.add(folderPath);

      try {
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        const targetBase = path.join(folderPath, path.basename(source));
        const target = source === targetBase ? targetBase : getUniqueTargetPath(targetBase);
        if (source !== target) {
          fs.renameSync(source, target);
        }
        moved++;
      } catch (err) {
        failed++;
        errors.push(`${path.basename(source)}: ${err.message}`);
      }
    }

    results.push({
      category,
      targetCategory,
      folderName,
      folders: [...folders],
      moved,
      failed,
      errors,
      success: failed === 0,
    });
  }

  return results;
}

module.exports = { generatePlan, executePlan, packItems };
