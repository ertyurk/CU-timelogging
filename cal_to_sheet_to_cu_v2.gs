// Project config
const CONFIG = [
  {
    "name": "<project key name i.e. \"mehmet\">",
    "clickupApiKey": "<clikcup apiKey>",
    "userId": "<clikcup user id>",
    "team_id": "<clikcup team id>",
    "list": "<clikcup list id>",
    "taskStatus": "Closed",
    "keywords": [
      "keyword0",
      "keyword1",
      "keyword2"
    ]
  }
]

const SLACK_HOOK = "<Your hook>";

const onOpen = () => {
  SpreadsheetApp.getUi().createMenu('Event menu')
    .addItem('🗓️  -  Retrieve meetings', 'getMeetings')
    .addItem('🚀  -  Push to Clickup', 'recordHandler')
    .addItem('🗄️  -  Archive entries', 'archive')
    .addToUi();
}

const recordHandler = async () => {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("entries");
  const lastRow = sheet.getLastRow();
  for (var i = 2; i <= lastRow; i++) {
    var meetings = sheet.getRange(`A${i}:M${i}`).getValues();
    for (meeting of meetings) {
      if (meeting[7] != 'Success') {
        var data = {
          task_name: meeting[0],
          description: meeting[1],
          duration: meeting[5],
          duration_hrs: meeting[6],
          start_date: meeting[3].getTime() / 1000,
          relation: meeting[2],
          tag: meeting[8],
          time_log_note: meeting[9],
          time_log_status: meeting[7],
          udid: meeting[11]
        }

        var cfg = await getConfig(data.relation)
        var is_created = await isTaskCreated(data.task_name)
        if (is_created.status == true) {
          await timeEntry(data, cfg, is_created.task)
        } else {
          await createTask(data, cfg)
        }
      }
    }
  }
}

const createTask = async (data, cfg) => {
  try {
    let url = `https://api.clickup.com/api/v2/list/${cfg.list}/task`;
    let payload = {
      name: data.task_name,
      description: data.description,
      tags: [data.tag],
      status: data.time_log_status,
    }

    let params = {
      method: 'POST',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: {
        "Content-Type": "application/json",
        "Authorization": cfg.clickupApiKey
      }, "payload": JSON.stringify(payload)
    }

    let r = UrlFetchApp.fetch(url, params);
    let res = JSON.parse(r.getContentText());
    let header = JSON.parse(r.getResponseCode());
    switch (header) {
      case 404 || 500:
        Logger.log('Task creation failed')
        break;
      default:
        await timeEntry(data, cfg, res.id);
    }

  } catch (e) {
    Logger.log(e)
  }
}

const timeEntry = async (data, cfg, taskId) => {
  var url = `https://api.clickup.com/api/v2/team/${cfg.team_id}/time_entries`;
  var payload = {
    "description": data.time_log_note,
    "start": data.start_date * 1000,
    "billable": true,
    "duration": data.duration,
    "assignee": cfg.userId,
    "tid": taskId
  }

  var params = {
    'method': 'POST',
    'muteHttpExceptions': true,
    'contentType': 'application/json',
    "headers": {
      "Content-Type": "application/json",
      "Authorization": cfg.clickupApiKey
    }, "payload": JSON.stringify(payload)
  };

  var res = UrlFetchApp.fetch(url, params);
  var header = JSON.parse(res.getResponseCode());
  switch (header) {
    case 200:
      Logger.log(`Duration time entried to the Clickup for ${data.task_name}`)
      await findRowByMeetingId(data.udid, 'Success', taskId)
      break;
    case 404 || 500:
      Logger.log('Time Entry failed')
      await findRowByMeetingId(data.udid, 'Failed', taskId)
      break;
    case 400:
      Logger.log('Access error')
      await findRowByMeetingId(data.udid, 'AUTH', taskId)
      break;
    default:
      Logger.log(data)
      await findRowByMeetingId(data.udid, 'ERROR', taskId)
  }
  
}

const getMeetings = async () => {
  var today = new Date();
  var events = CalendarApp.getDefaultCalendar().getEventsForDay(today);
  Logger.log(`Total events: ${events.length} , at ${today}`);

  for (let i = 0; i < events.length; i++) {
    var title = events[i].getTitle();
    var description = events[i].getDescription();
    var startTime = events[i].getStartTime();
    var endTime = events[i].getEndTime();
    var duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    var udid = events[i].getId();
    // Check whether i am out of office 
    // Or if meeting status is "MAYBE" 
    // Then pass the meeting record
    if (
      title.toLowerCase().includes("ooo")
      || events[i].getMyStatus() == "MAYBE"
    ) continue;

    var relations = await titleController(title);
    if (!relations) {
      // change here for your default project keyname for unknown tasknames
      relations = "mehmet"
    };

    var result = [
      title,
      description,
      relations,
      startTime,
      endTime,
      duration, // duration
      duration / 3600000, // convert duration (ms) to hrs
      'Pending', // initial status
      `Automated Timelog`, // tag
      `${title} - Automated Timelog Note`, // time_log_note
      '0',
      udid
    ];
    SpreadsheetApp.getActive().getSheetByName('entries').appendRow(result)
  }
}

// Time log status is optional here to update timelogstatus' value
const findRowByMeetingId = async (id, timeLogStatus, taskID) => {
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName('entries');
    var indexById = sheet.createTextFinder(id).findNext().getRowIndex();

    if (timeLogStatus) sheet.getRange(`H${indexById}`).setValue(timeLogStatus)
    if (taskID) sheet.getRange(`K${indexById}`).setValue(`https://app.clickup.com/t/${taskID}`)
    
    return {
      "status": true
    }

  } catch (err) {
    return {
      "status": false
    }
  }
}

const archive = () => {
  var total = 0;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("entries");
  var resultRows = sheet.getLastRow();
  var range = sheet.getDataRange();
  var headers = sheet.getRange(`A1:N1`).getValues();
  for (var i = 2; i <= resultRows; i++) {
    var rowValues = sheet.getRange(`A${i}:N${i}`).getValues();
    // add up all successfull logs
    if (rowValues[0][7] == 'Success') {
      SpreadsheetApp.getActive().getSheetByName('archive').appendRow(rowValues[0])
      total = total + rowValues[0][6]
    } else {
      // if log is not succeeded then keep it still in entries
      headers.push(rowValues[0])
    }
  }
  Logger.log(`All records pushed to archive`)
  range.clearContent();
  headers.forEach(row => SpreadsheetApp.getActive().getSheetByName('entries').appendRow(row))
  notifySlack(total);
}

const notifySlack = (total) => {
  let text;
  if (total > 0) {
    text = `Total Logged for yesterday is *${total.toString().slice(0,6)}* hrs`
  } else {
    text = `No logging for today`
  }

  var payload = {
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": text
        }
      }
    ]
  }

  var options = {
    "method": "post",
    "headers": {
      "Content-type": "application/json",
    },
    "payload": JSON.stringify(payload)
  };
  UrlFetchApp.fetch(SLACK_HOOK, options);
  Logger.log(`Slack notified as ${total} hrs`)
}

const titleController = (title) => {
  for (let project of CONFIG) {
    for (let keyword of project.keywords)
      if (title.toLowerCase().includes(keyword)) {
        return project.name;
      }
  }
}

const getConfig = async (prj) => {
  for (let project of CONFIG) {
    if (prj == project.name) return project
  }
}

const isTaskCreated = async (text) => {

  // Try to find Task id and space from the title with regexp
  result = /#([a-zA-Z0-9]+)-([a-zA-Z0-9]+)/.exec(text)

  // if there is no space, try to catch only taskid
  if (result == null) {
    result = /#([a-zA-Z0-9]+)/.exec(text)
  }

  // finally, return true or false according to the task id
  if (result != null) {
    return {
      "status": true,
      "task": result[1],
      "space": result[2] ? result[2] : false
    }
  } else {
    return {
      "status": false
    }
  }
}
