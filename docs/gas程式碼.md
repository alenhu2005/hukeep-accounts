function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function getGeminiCategory(item) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey || !item) return '';
  var url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' +
    apiKey;

  var payload = {
    contents: [
      {
        parts: [
          {
            text:
              '消費項目「' +
              item +
              '」屬於哪個類別？只能從以下選一個，直接回答詞語：餐飲、交通、住宿、購物、娛樂、生活、賭博、其他。' +
              '博弈、撲克、麻將、德州撲克、百家樂、21點、骰子、押注等歸類為賭博。',
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 200, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  };

  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      deadline: 10,
    });
    var body = JSON.parse(res.getContentText());
    var parts = body.candidates[0].content.parts;
    var text = parts[parts.length - 1].text.trim();

    var cats = ['餐飲', '交通', '住宿', '購物', '娛樂', '生活', '賭博', '其他'];
    var found = cats.find(function (c) {
      return text.indexOf(c) >= 0;
    });
    return found || '';
  } catch (e) {
    return '';
  }
}

/* ===== Drive 圖片上傳 ===== */
var LEDGER_PHOTO_FOLDER_NAME = 'ledger-app-uploads';
var LEDGER_PHOTO_SUBFOLDERS_BY_KEY = {
  photo: 'photos',
  tripPhoto: 'trip-photos',
  avatar: 'avatars',
};
var MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function ensureRootFolder_() {
  var folderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      // folder ID 失效（已刪除等），改用名稱搜尋或新建
    }
  }

  var folders = DriveApp.getRootFolder().getFoldersByName(LEDGER_PHOTO_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.getRootFolder().createFolder(LEDGER_PHOTO_FOLDER_NAME);
}

function ensureSubFolder_(subName) {
  var root = ensureRootFolder_();
  if (!subName) return root;

  var folders = root.getFoldersByName(subName);
  if (folders.hasNext()) return folders.next();
  return root.createFolder(subName);
}

function uploadImageDataUrlToDrive_(dataUrl, filePrefix, subFolderName) {
  if (!dataUrl) return null;

  var m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid image DataUrl');

  var mime = m[1];
  var b64 = m[2];
  var bytes = Utilities.base64Decode(b64);

  if (!bytes || bytes.length <= 0) throw new Error('Empty image bytes');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image too large');

  var folder = ensureSubFolder_(subFolderName);
  var ext = mime.split('/')[1] || 'jpg';
  var fileName = (filePrefix || 'img') + '_' + Utilities.getUuid() + '.' + ext;

  var blob = Utilities.newBlob(bytes, mime, fileName);
  var file = folder.createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // 權限設定失敗不中斷
  }

  var fileId = file.getId();
  var url = 'https://lh3.googleusercontent.com/d/' + fileId;
  return { url: url, fileId: fileId };
}

function processAllImageDataUrls_(data) {
  Object.keys(data).forEach(function (key) {
    if (!key || key.slice(-7) !== 'DataUrl') return;

    var base = key.slice(0, -7);
    var dataUrl = data[key];
    var subFolderName = LEDGER_PHOTO_SUBFOLDERS_BY_KEY[base] || '';

    if (!dataUrl) {
      data[base + 'Url'] = '';
      data[base + 'FileId'] = '';
      delete data[key];
      return;
    }

    var uploaded = uploadImageDataUrlToDrive_(dataUrl, base, subFolderName);
    if (uploaded) {
      data[base + 'Url'] = uploaded.url;
      data[base + 'FileId'] = uploaded.fileId;
      delete data[key];
    }
  });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    processAllImageDataUrls_(data);

    var sheetName;
    if (data.type === 'daily' || data.type === 'settlement') {
      sheetName = '日常';
    } else if (data.type === 'avatar') {
      sheetName = '人物';
    } else {
      sheetName = '出遊';
    }

    var sheet = getSheet(sheetName);

    var keys = Object.keys(data);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(keys);
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    keys.forEach(function (key) {
      if (headers.indexOf(key) === -1) {
        sheet.getRange(1, headers.length + 1).setValue(key);
        headers.push(key);
      }
    });

    if (headers.indexOf('category') === -1) {
      sheet.getRange(1, headers.length + 1).setValue('category');
      headers.push('category');
    }

    if (data.action === 'add' && (data.type === 'daily' || data.type === 'tripExpense') && data.item) {
      var catIn = data.category != null ? String(data.category).trim() : '';
      if (!catIn) {
        data.category = getGeminiCategory(data.item);
      }
    }

    var rowData = headers.map(function (h) {
      return data[h] !== undefined ? data[h] : '';
    });

    sheet.appendRow(rowData);

    return ContentService.createTextOutput(JSON.stringify({ result: 'success' })).setMimeType(
      ContentService.MimeType.JSON,
    );
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', message: error.toString() })).setMimeType(
      ContentService.MimeType.JSON,
    );
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var records = [];

  ['日常', '出遊', '人物'].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() === 0) return;

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        obj[headers[j]] = data[i][j];
      }
      records.push(obj);
    }
  });

  return ContentService.createTextOutput(JSON.stringify(records)).setMimeType(ContentService.MimeType.JSON);
}

function authorizeDrive() {
  var testFolder = DriveApp.getRootFolder().createFolder('__ledger_auth_test__');
  Logger.log('建立資料夾成功：' + testFolder.getName());
  DriveApp.removeFolder(testFolder);
  Logger.log('Drive 讀寫權限正常');
}

function testGemini() {
  Logger.log(getGeminiCategory('便當'));
}