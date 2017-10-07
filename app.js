const express = require('express');
//set an instance of exress
const  app = express();
//require the body-parser nodejs module
const bodyParser = require('body-parser');
//require the path nodejs module
const path = require("path");
//define port number
const PORT = process.env.PORT || 80;
//require filesystem
const fs = require('fs');
//require readline
const readline = require('readline');
//require Google APIs
const google = require('googleapis');
//require Google Authentication Library
const googleAuth = require('google-auth-library');

// If modifying these scopes, delete your previously saved credentials
// at <$USERHOME>/.credentials/cleanroom_checklist_tokens.json
var SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'cleanroom_checklist_tokens.json';

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Allows us to easily read the payload from the webhook
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}))
// Set static path
app.use(express.static(path.join(__dirname, 'public')))

/**
* Create an OAuth2 client with the given credentials, and then execute the
* given callback function.
*
* @param {Object} credentials The authorization client credentials.
* @param {function} callback The callback to call with the authorized client.
*/
function authorize(credentials, callback, sheetInfo, data) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function(err, token) {
        if (err) {
            getNewToken(oauth2Client, callback, sheetInfo, data);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            callback(oauth2Client, sheetInfo, data);
        }
    });
}

/**
* Get and store new token after prompting for user authorization, and then
* execute the given callback with the authorized OAuth2 client.
*
* @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
* @param {getEventsCallback} callback The callback to call with the authorized
*     client.
*/
function getNewToken(oauth2Client, callback, sheetInfo, data) {
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function(code) {
        rl.close();
        oauth2Client.getToken(code, function(err, token) {
            if (err) {
                console.log('Error while trying to retrieve access token', err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client, sheetInfo, data);
        });
    });
}

function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function loadSheetInfo(content){
    var parsed = JSON.parse(content)
    var lastSubmit = parsed.lastSubmit;
    var spreadsheetId = parsed.spreadsheetId;
    var sheetName = parsed.sheetName;
    var sheetLabels = parsed.sheetLabels;
    var lastUser = parsed.lastUser;
    var publicMessage = parsed.publicMessage;
    // console.log('>>> Sheet properties loaded')
    return [lastSubmit, spreadsheetId, sheetName, sheetLabels, lastUser, publicMessage]
}

function saveSheetInfo(sheetInfo){
    var data = {
        "lastSubmit": sheetInfo[0],
        "spreadsheetId":sheetInfo[1],
        "sheetName":sheetInfo[2],
        "sheetLabels":sheetInfo[3],
        "lastUser":sheetInfo[4],
        "publicMessage":sheetInfo[5],
    }
    fs.writeFile(path.join(__dirname, 'config/sheets_info.json'), JSON.stringify(data), function processDataToSave(err, sheetcontent) {
        if (err) {
            console.log('Error saving sheets info file: ' + err);
            return;
        } else {
            console.log('>>> Sheet info file updated with new sheet properties');
        } //else
    }); //writeFile
}

// STEP 0
function updateSubmitDate(res, req){
    fs.readFile(path.join(__dirname, 'config/sheets_info.json'), function processClientSecrets(err, sheetcontent) {
        if (err) {
            console.log('Error loading sheets info file: ' + err);
            return;
        } else {
            // console.log('Sheet info read');
            // var lastSubmit = loadSheetInfo(sheetcontent)[0];
            // var spreadsheetId = loadSheetInfo(sheetcontent)[1];
            // var sheetName = loadSheetInfo(sheetcontent)[2];
            // var sheetLabels = loadSheetInfo(sheetcontent)[3];
            // var lastUser = loadSheetInfo(sheetcontent)[4];
            // var publicMessage = loadSheetInfo(sheetcontent)[5];
            [lastSubmit, spreadsheetId, sheetName, sheetLabels, lastUser, publicMessage] = loadSheetInfo(sheetcontent);
            // console.log(publicMessage)
            var date = new Date(lastSubmit)
            var date_options = {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                // timeZoneName: 'short',
                timeZone: 'America/Los_Angeles',
            };
            var time_options = {
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                // timeZoneName: 'short',
                timeZone: 'America/Los_Angeles',
                hour12: 'true'
            };
            res.render('index', {
                title: 'Last submitted by ' + lastUser + ' on',
                date: date.toLocaleDateString('en-US', date_options),
                time:date.toLocaleTimeString('en-US', time_options),
                message: publicMessage,
                user: lastUser
            }); //render
        }
    });
}

// STEP 1
function readSheetsInfo(req){
    fs.readFile(path.join(__dirname, 'config/sheets_info.json'), function processClientSecrets(err, sheetcontent) {
        if (err) {
            console.log('Error loading sheets info file: ' + err);
            return;
        } else {
            console.log('Saving sheet step 1/5 - Read sheet configuration file')
            var input = JSON.parse(JSON.stringify(req.body));
            var nested_keys = get_nested_keys(input, [], '');
            var data = [];
            for (k in nested_keys){
                key = nested_keys[k];
                var sheets_key = (key.slice(1)).replace(/\./g, '_');
                data.push([sheets_key, eval('input' + key)])
            }
            var sheetInfo = loadSheetInfo(sheetcontent)
            sheetInfo[4] = input.UserInfo.Initials
            sheetInfo[5] = input.PublicMessage
            readClientInfo(checkSheet, sheetInfo, data)
        } //else
    }); //fs.readFile
}
// STEP 2
function readClientInfo(callback, sheetInfo, data){
    // Load client secrets from a local file.
    fs.readFile(path.join(__dirname,'config/client_secret.json'), function processClientSecrets(err, clientcontent) {
        if (err) {
            console.log('Error loading client secret file: ' + err);
            return;
        } else {
            console.log('Saving sheet step 2/5 - Read Google authentication file')
            // Authorize a client with the loaded credentials, then call the Google Sheets API.
            authorize(JSON.parse(clientcontent), callback, sheetInfo, data);
        } //else
    }); //readFile
}
//STEP 3
// Check sheet labels, if different than current sheet,
// make new sheet, and add entries of data to sheet
function checkSheet(auth, sheetInfo, data){
    // var lastSubmit = sheetInfo[0];
    // var spreadsheetId = sheetInfo[1];
    // var sheetName = sheetInfo[2];
    // var sheetLabels = sheetInfo[3];
    // var lastUser = sheetInfo[4];
    // var publicMessage = sheetInfo[5];
    var [lastSubmit, spreadsheetId, sheetName, sheetLabels, lastUser, publicMessage] = sheetInfo
    // Read first line of sheet
    var sheets = google.sheets('v4');
    sheets.spreadsheets.values.get({
        auth: auth,
        spreadsheetId: spreadsheetId,
        range: sheetName + '!A1:ZZ1',
    }, function(err, result) {
        if(err) {
            console.log(err);
        } else {
            console.log('Saving sheet step 3/5 - Checking sheet labels consistent')
            var amountOfData = 'partial'
            var submitted_labels = transpose(data)[0]
            if (arraysEqual(submitted_labels, (result.values)[0])){
                console.log('[Check result: Sheet labels same]')
            } else {
                console.log('>>> Check result: Sheet labels different')
                amountOfData = 'full'
            }
            sendDataAndUpdateSheet(data, sheetInfo, amountOfData);
        } //else
    });//sheets.spreadsheets.values.get
} //function

// STEP 4
function sendDataAndUpdateSheet(data, sheetInfo, amountOfData){
    fs.readFile(path.join(__dirname,'config/client_secret.json'), function processClientSecrets(err, clientcontent) {
        if (err) {
            console.log('Error loading client secret file: ' + err);
            return;
        } else {
            console.log('Saving sheet step 4/5 - Preparing to update the sheet')
            if (amountOfData == 'partial'){
                // Authorize a client with the loaded credentials, then call the Google Sheets API.
                authorize(JSON.parse(clientcontent), updateSheet, sheetInfo, [transpose(data)[1]]);
            } else {
                // Authorize a client with the loaded credentials, then call the Google Sheets API.
                authorize(JSON.parse(clientcontent), batchUpdateNewSheet, sheetInfo, data);
            }
        } //else
    }); //fs.readFile
}

 //STEP 4.5
function batchUpdateNewSheet(auth, sheetInfo, data){
    // var lastSubmit = sheetInfo[0];
    // var spreadsheetId = sheetInfo[1];
    // var sheetName = sheetInfo[2];
    // var sheetLabels = sheetInfo[3];
    // var lastUser = sheetInfo[4];
    // var publicMessage = sheetInfo[5];
    var [lastSubmit, spreadsheetId, sheetName, sheetLabels, lastUser, publicMessage] = sheetInfo
    // Create ID based on date and time
    var date_string = getFormattedDate(new Date())
    var title = 'EntryStart' + date_string
    // update sheetInfo values
    sheetInfo[2] = title
    sheetInfo[3] = transpose(data)[0]//
    //BATCH UPDATE REQUEST
    var requests = [];
    // Make new sheet in spreadsheet with datetime number as ID
    requests.push({
        addSheet: {
            properties: {
                sheetId: parseInt(date_string), // NOTE THIS IS LIMITED TO 10 DIGITS LONG
                title: title
            }
        }
    });
    var batchUpdateRequest = {requests: requests};
    var sheets = google.sheets('v4');
    sheets.spreadsheets.batchUpdate({
        auth: auth,
        spreadsheetId: spreadsheetId,
        resource: batchUpdateRequest
    }, function(err, response) {
        if(err) {
          // Handle error
          console.log(err);
        } else {
            console.log('Saving sheet step 4.5/5 - Making a new sheet because labels are inconsistent')
            fs.readFile(path.join(__dirname,'config/client_secret.json'), function processClientSecrets(err, clientcontent) {
                if (err) {
                    console.log('Error loading client secret file: ' + err);
                    return;
                } else {
                    authorize(JSON.parse(clientcontent), updateSheet, sheetInfo, transpose(data));
                }
            });
        }
    });
}
//STEP 5
// Add entries of data to sheet
function updateSheet(auth, sheetInfo, data){
    // var lastSubmit = sheetInfo[0];
    // var spreadsheetId = sheetInfo[1];
    // var sheetName = sheetInfo[2];
    // var sheetLabels = sheetInfo[3];
    // var lastUser = sheetInfo[4];
    // var publicMessage = sheetInfo[5];
    var [lastSubmit, spreadsheetId, sheetName, sheetLabels, lastUser, publicMessage] = sheetInfo
    var body = {
        values: data
    };
    var sheets = google.sheets('v4');
    sheets.spreadsheets.values.append({
        auth: auth,
        spreadsheetId: spreadsheetId,
        range: sheetName + '!A1:ZZ',
        valueInputOption: 'USER_ENTERED',
        resource: body
    }, function(err, result) {
        if(err) {
            console.log(err); // Handle error
        } else {
            console.log('Saving sheet step 5/5 - Saving the data to sheet')
            console.log('>>> Sheet ranges ' + result.updates.updatedRange + ' updated');
            sheetInfo[0] = new Date();
            saveSheetInfo(sheetInfo)
        }
    });
}

// Transposes an array
function transpose(a) {
  // Calculate the width and height of the Array
  var w = a.length || 0;
  var h = a[0] instanceof Array ? a[0].length : 0;
  // In case it is a zero matrix, no transpose routine needed.
  if(h === 0 || w === 0) { return []; }
  /**
   * @var {Number} i Counter
   * @var {Number} j Counter
   * @var {Array} t Transposed data is stored in this array.
   */
  var i, j, t = [];
  // Loop through every item in the outer array (height)
  for(i=0; i<h; i++) {
    // Insert a new row (array)
    t[i] = [];
    // Loop through every item per item in outer array (width)
    for(j=0; j<w; j++) {
      // Save transposed data.
      t[i][j] = a[j][i];
    }
  }
  return t;
}

//returns Date in string format YYMMDDHHMM
function getFormattedDate(d){
    var d_year =  d.getFullYear() - 2000 // Should work till 2099, when I'll be dead ¯\_(ツ)_/¯
    d_year = '' + d_year
    var d_month =  d.getMonth() + 1
    if ((d_month) < 10){
        d_month = '0' + d_month
    }
    var d_date = d.getDate()
    if ((d_date) < 10){
        d_date = '0' + d_date
    }
    var d_hours = d.getHours()
    if ((d_hours) < 10){
        d_hours = '0' + d_hours
    }
    var d_minutes = d.getMinutes()
    if ((d_minutes) < 10){
        d_minutes = '0' + d_minutes
    }
    var d_seconds = d.getSeconds()
    if ((d_seconds) < 10){
        d_seconds = '0' + d_seconds
    }
    return '' + d_year + d_month + d_date + d_hours + d_minutes;
}
/**
* Store token to disk be used in later program executions.
*
* @param {Object} token The token to store to disk.
*/
function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to ' + TOKEN_PATH);
}
// Looks for all nested keys in a json (does not do json arrays)
function get_nested_keys(json, keys, parent_key){
    var reached_end = false;
    var full_key = ''
    for(var i in json){
        var key = i;
        var val = json[i];
        if (typeof(val) == 'string' || val == null || typeof(val) == 'boolean' || typeof(val) == 'number'){
            full_key = parent_key + '.' + key
            keys.push(full_key);
        } else {
            get_nested_keys(val, keys, parent_key + '.' + key)
        }
    }
    return keys
}

// Homepage
app.get('/checklist', function (req, res) {
    updateSubmitDate(res, req);
});

app.get('/', function (req, res) {
    res.redirect('/checklist');
});

// Message Page
app.get('/checklist/message', function (req, res) {
    res.render('message', {
        title: 'Last submitted by ' + lastUser + ' on',
        date: date.toLocaleDateString('en-US', date_options),
        time:date.toLocaleTimeString('en-US', time_options),
        message: publicMessage,
        user: lastUser
    }); //render
});

// POST request
app.post('/checklist', function(req, res){
    console.log('Recieved online submission at ' + (new Date()));
        readSheetsInfo(req);
        updateSubmitDate(res, req);
});

// app.post('/submit', function(req, res){
//     req.checkBody('json_input', 'Input empty').notEmpty();
//     var errors = req.validationErrors();
//     if (errors){
//         res.render('index', {
//             title: 'ERROR: Input empty',
//             details: null
//         });
//     } else {
//         var input = JSON.parse(req.body.json_input);
//         lastSubmit = new Date();
//         console.log('JSON submitted at ' + lastSubmit);
//         res.render('index', {
//             title: 'Submitted on ' + lastSubmit,
//             details: JSON.stringify(input)
//         });
//     };
// });

app.listen(PORT, function () {
    console.log('Listening on port ' + PORT);
});
