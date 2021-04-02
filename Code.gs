/*
  Integration between Airtable - Google Calander - Clickup 
    This script helps you to record your timelogs from airtable to clickup with your calendar events
  or any manual records in the Airtable if the area choosed as Work and timeLogStatus is Pending. 

    1. Clone this script to your google drive;
    2. Setup your airtable grid view for followings;
        - Titles: name	description	area	startDate	taskStatus	endDate	duration	dependencies	timeLogStatus
        - `duration` formula: `DATETIME_DIFF(endDate,startDate,'ms')`
          - !! If startDate and endDate is not settled then this script will not work.
        - timeLogStatus: default text `Pending`
    3. Setup your airtable Calendar View for followings;
        - Using date Range: Using date range from startDate to endDate 
        - Setup automation for calendar with the config > https://drive.google.com/file/d/1Y8oL_t0dYnV00bvQoa2s7qwDkX0d5u_I/view?usp=sharing
    4. Setup cron configurations according to your need > https://drive.google.com/file/d/1m8o6o9a1htV79RBfvqF7L1rigg0leB1a/view?usp=sharing
    5. Define missing variables from below;

  Click up result > https://drive.google.com/file/d/15NhFb_FJw0frUPAMP5smpuBziesDAKBK/view?usp=sharing
  PS: some helper screenshots can be found here https://drive.google.com/drive/folders/14whyFTd4Q34ALYVmnvHbTJbSdv3WGD9n?usp=sharing 
*/

// VARIABLES
const AIR_TABLE_KEY = `<your AIR_TABLE_KEY>`
const CLICKUP_KEY = '<your CLICKUP_API_KEY>'
const CLICKUP_LIST_ID = '44623749' // List path -> La3eb > LS Handover > Backlog

// ALP's userID - 2533166, 
// Arda's UserID - 3827277, 
// Resat's UserID - 3855819,
// Utku's UserID - 3798383,
const CLICKUP_USER = 3606225  // Mehmet's User ID

// Associated Team for Mehmet in this context its `La3eb & MEC` , team ID for `Lean Scale` (dca etc) > 1852902
const CLICKUP_TEAMID = 2436830  
const TARGET_ORDER_STATUS = 'Blocked' 
// Once you finalise your tests and monitorings
// You can create tasks directly as `CLOSED`

const main = async () => {
  await retrieveAirTableColumns()
}

const retrieveAirTableColumns = async () => {
  var url = `https://api.airtable.com/v0/app09CZMDVmc2Daud/Default`
  var options = {
    "method": "get",
    "headers": {
      "accept": "application/json",
      "Authorization": `Bearer ${AIR_TABLE_KEY}`
    }
  };
  var res = await UrlFetchApp.fetch(url, options);
  var data = JSON.parse(res.getContentText());
  data.records.map(async (i) => {
    if (i.fields.timeLogStatus == 'Pending') {
      if (i.fields.area == 'Work') {
        if (i.fields.name) {
          var taskName = i.fields.name
        } else {
          var taskName = "1"
        }

        if (i.fields.description) {
          var taskDescription = i.fields.description
        } else {
          var taskDescription = "2"
        }

        if (i.fields.startDate) {
          var taskStartDate = new Date(i.fields.startDate).getTime() / 1000; //epoch
        } else {
          var taskStartDate = "-"
        }

        if (i.fields.duration) {
          var duration = i.fields.duration
        } else {
          var duration = ""
        }
        var columndID = i.id;
        var dta = {
          "taskName": taskName,
          "taskDescription": taskDescription,
          "duration": duration,
          "dateEpoch": taskStartDate,
          "columndID": columndID
        }
        var today = new Date().getTime() / 1000;
        if (today > taskStartDate) {
          await createClickUpTask(dta)
        } else {
          Logger.log(`${dta.taskName} Task did not finish yet.`)
        }

      }
    }
  })
}

const createClickUpTask = async (dta) => {
  Logger.log(`${dta.taskName} will be created for the timelog as CLOSED`)
  var url = `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`
  var payload = {
    "name": dta.taskName,
    "description": dta.taskDescription,
    "tags": ["Automated Timelog"],
    "status": TARGET_ORDER_STATUS
  }

  var params = {
    'method': 'POST',
    'muteHttpExceptions': true,
    'contentType': 'application/json',
    "headers": {
      "Content-Type": "application/json",
      "Authorization": `pk_3606225_QP7Y2WXXM6SHICC9Z9UKZI2K4XIO9RFO`
    }, "payload": JSON.stringify(payload)
  };

  var res = await UrlFetchApp.fetch(url, params);
  var data = JSON.parse(res.getContentText());
  await createTimeEntry(data.id, dta)
}

const createTimeEntry = async (taskID, dta) => {
  var url = `https://api.clickup.com/api/v2/team/${CLICKUP_TEAMID}/time_entries`
  var payload = {
    "description": dta.taskName,
    "start": dta.dateEpoch*1000,
    "billable": true,
    "duration": dta.duration,
    "assignee": CLICKUP_USER,
    "tid": taskID
  }

  var params = {
    'method': 'POST',
    'muteHttpExceptions': true,
    'contentType': 'application/json',
    "headers": {
      "Content-Type": "application/json",
      "Authorization": `pk_3606225_QP7Y2WXXM6SHICC9Z9UKZI2K4XIO9RFO`
    }, "payload": JSON.stringify(payload)
  };

  var res = await UrlFetchApp.fetch(url, params);
  var data = JSON.parse(res.getResponseCode());

  if (data === 200) {
    Logger.log(`Duration time entried to the Clickup for ${dta.taskName}`)
    updateTimeLogStatusColumn(dta, 'Success')
  } else {
    Logger.log('Time Entry failed')
    updateTimeLogStatusColumn(dta, 'Failed')
  }
}

const updateTimeLogStatusColumn = async (dta, logStatus) => {
  Logger.log(`airTable timeLogStatus is updated as ${logStatus}`)
  var url = `https://api.airtable.com/v0/app09CZMDVmc2Daud/Default/${dta.columndID}`
  var payload = { "fields": { "timeLogStatus": logStatus } }
  var params = {
    'method': 'PATCH',
    'muteHttpExceptions': true,
    'contentType': 'application/json',
    "headers": {
      "accept": "application/json",
      "Authorization": `Bearer ${AIR_TABLE_KEY}`
    }, "payload": JSON.stringify(payload)
  };
  await UrlFetchApp.fetch(url, params);
}

