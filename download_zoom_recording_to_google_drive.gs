/*
  *
  * This is an automation that helps you to move your recordings 
  * from Zoom clouds to Google drive and send email for recording url to the event attendees
  * if it findable in your google calander that works within Google App Script
  * 
  *  Instructions:
  *  - Copy code from this file.
  *  - Create a new google apps script file from here: https://script.google.com/
  *  - Login to zoom account and navigate to here: https://marketplace.zoom.us/develop/create
  *  - Create a JWT and set jwt token expiry as per your need like 
  *    in the image: https://drive.google.com/file/d/181AUoYFZix_36qdsmoyeUH9vegYkhQKR/view?usp=sharing
  *  - Find your Zoom User ID
  *  - Create a Slack incoming hook to your channel or to your self as private message
  *
  *  How to run:
  *  - Once the constants mentioned below are provided, you can set Google Apps Script triggers like 
  *    in the image: https://drive.google.com/file/d/1f4_Lj81WgsMTO6FU5ZiUB69OVQKsfN-a/view?usp=sharing
  *  - Run one time manually and give required permissions. 
  *  - Once script is triggered, It will review all the meetings from UserID. 
  *  - If the meeting recording's process is finished, it uploads that recording only 
  *  - to the corresponding folder. 
  *  - Folder Hierarchy: FOLDER > YEAR > MONTH > Recording Folder > Meeting record file
  *  - Once new folder created for the required meeting, slack notification will be sent to your desired channel 
  *    or to you as private message
  *  - Additionally, the script will try to match your meeting topic and calander event topic with the help of 
  *    Task ID ie. #b5a896f. If it can find relevant meeting, Retrieves the guest users
  *    and send recording url to the users with changing the permissions as anyone with link from your gmail address. 
  *  
*/

// COMMON VARIABLES TO BE CONFIGURED
const TOKEN = <YOUR ZOOM TOKEN HERE>
const USER_ID = <YOUR ZOOM USER ID HERE>
const FOLDER = <YOUR GOOGLE DRIVE FOLDER ID HERE>
const ZOOM_URL = 'https://api.zoom.us/v2'
const SLACK_HOOK = <YOUR SLACK WEBHOOK HERE>
const PARAMS = {
  'method': 'GET',
  'muteHttpExceptions': true,
  'contentType': 'application/json',
  "headers": {
    "Content-Type": "application/json",
    'User-Agent': 'Zoom-Jwt-Request',
    "Authorization": `Bearer ${TOKEN}`
  }
};


const retrieveMeetingsFromZoom = async () => {
  var url = ZOOM_URL + '/users/' + USER_ID + '/recordings';
  var res = UrlFetchApp.fetch(url, PARAMS);
  var data = JSON.parse(res.getContentText());
  data.meetings.length
    ? data.meetings.forEach(async meeting => {
      var meeting_id = meeting.id; // set meeting id for deleting later.
      var meeting_name = meeting.topic;
      var meeting_date = meeting.start_time;
      var folder_name = `${meeting_date.slice(0, 10)} ${meeting_name}`.replace(/ /gm, "_");

      meeting.recording_files.forEach(async recording => {
        if (recording.file_type == "MP4" && recording.status == 'completed') {
          Logger.log(`Meeting: ${meeting_name} is uploading...`);
          var file_name = `${folder_name}.${recording.file_extension}`;

          await moveRecording(folder_name, file_name, recording.download_url, meeting_id);
        } else {
          recording.status == 'completed'
            ? Logger.log(`${meeting_name}'s ${recording.file_extension} recording is passed.`)
            : Logger.log(`${meeting_name} is not processed yet.`);
        }
      })
    })
    : Logger.log(`There is no meeting recorded.`);
};

const moveRecording = async (folder_name, file_name, download_url, meeting_id) => {
  var target_folder = await folderManager(folder_name);
  var new_folder = DriveApp
    .getFolderById(target_folder)
    .createFolder(folder_name)
    .getId();
  Logger.log(`Folder: ${folder_name} created.`);

  var video = UrlFetchApp.fetch(download_url);
  var url = await DriveApp
    .getFolderById(new_folder)
    .createFile(video.getBlob())
    .setName(file_name).getUrl();

  Logger.log(`Recording: ${file_name} is uploaded.\nStarting to remove zoom cloud recording.`);
  slackNotifier(url, folder_name)
  shareToPeople(folder_name, new_folder)
  await deleteRecordingFromZoom(meeting_id);
}

const shareToPeople = async (topic, folder_id) => {
  // share folder to the multiple people with view access
  email = await retrieveCal(topic)

  if (email.length) {
    Logger.log(`Meetings will sent to ${email}`)
    var folder = DriveApp
      .getFolderById(folder_id)
      .setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
      .getUrl();
    GmailApp.sendEmail(email.join(), `Meeting Recording: ${topic}`, `Please find the ${topic}'s recording below.\n\n${folder}`, );
  } else {
    Logger.log(`Meeting not found from your calander.`);
  }
  
}

const retrieveCal = async (meetingTest) => {
  var emails = []
  var today = new Date();
  var events = CalendarApp.getDefaultCalendar().getEventsForDay(today);
  for (var i = 0; i < events.length; i++) {
    var fromCal = await isTaskCreated(events[i].getTitle());
    var fromFolder = await isTaskCreated(meetingTest);
    if (fromCal.status && fromFolder.status && fromCal.task == fromFolder.task) {
      events[i].getGuestList().forEach(guest => {
        emails.push(guest.getEmail())
      })
    }
  }
  return emails;
}

const folderManager = async (target) => {
  // folder creator
  const create = (new_folder, target_folder) => DriveApp
    .getFolderById(new_folder)
    .createFolder(target_folder).getId();

  const folderFinder = async (search_key, folder = FOLDER) => {
    var main = DriveApp.getFolderById(folder).getFolders();
    while (main.hasNext()) {
      var sub = main.next();
      return sub.getName() == search_key 
        ? result = sub.getId() 
        : result = null;
    }
  }

  var find_year = await folderFinder(target.slice(0, 4));

  if (!find_year) {
    Logger.log(`Year not found ${find_year}`);
    var new_year = create(FOLDER, target.slice(0, 4));
    Logger.log(`New year created ${new_year}`);

    var new_month = create(new_year, target.slice(5, 7));
    Logger.log(`New month created ${new_month}`);

    return new_month;
  } else {
    Logger.log(`year found ${find_year}`);
    var find_month = await folderFinder(target.slice(5, 7), find_year);

    if (!find_month) {
      Logger.log(`find month not found ${find_month}`);
      var new_month = create(find_year, target.slice(5, 7));
      Logger.log(`New month created ${new_month}`);

      return new_month;
    } else {
      Logger.log(`Month found ${find_month}`);

      return find_month;
    }
  }
};

const deleteRecordingFromZoom = async (meeting_id) => {
  var url = ZOOM_URL + '/meetings/' + meeting_id + '/recordings';
  var params = {
    'method': 'DELETE',
    'muteHttpExceptions': true,
    'contentType': 'application/json',
    "headers": {
      "Content-Type": "application/json",
      'User-Agent': 'Zoom-Jwt-Request',
      "Authorization": `Bearer ${TOKEN}`
    }
  };
  var res = UrlFetchApp.fetch(url, params);
  var data = JSON.parse(res.getResponseCode());
  switch (data) {
    case 204:
      Logger.log(`Meeting recording deleted.`);
      break;
    case 200:
      Logger.log(`You do not have the right permission`);
      break;
    case 404:
      Logger.log('There is no recording for this meeting.');
      break;
    case 400:
      Logger.log('Error Code: 1010 > User does not belong to this account.');
      break;
    default:
      Logger.log(`Deleting faced an unknown Error ${res}, ${data}`);
  }
}

const slackNotifier = async (url, folder_name) => {
  Logger.log(`Slack notification triggered for ${folder_name}`);
  var payload = {
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `New meeting record is arrived\n*${folder_name}*`
        },
        "accessory": {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "GDrive",
            "emoji": true
          },
          "style": "primary",
          "url": url,
          "action_id": "button-action"
        }
      }
    ]
  };

  var options = {
    "method": "post",
    "headers": {
      "Content-type": "application/json",
    },
    "payload": JSON.stringify(payload)
  };
  UrlFetchApp.fetch(SLACK_HOOK, options);
}

const isTaskCreated = async (title) => {

  // Try to find Task id and space from the title with regexp
  result = /#([a-zA-Z0-9]+)-([a-zA-Z0-9]+)/.exec(title)
  // if there is no space, try to catch only taskid
  if (result == null) {
    result = /#([a-zA-Z0-9]+)/.exec(title)
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
