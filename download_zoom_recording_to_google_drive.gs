/*
 *
 * This is an automation that helps you to move your recordings 
 * from Zoom clouds to Google drive that works within Google App Script
 * Instructions:
 *  - Copy code from this file.
 *  - Create a new google apps script file from here: https://script.google.com/
 *  - Login to zoom account and navigate to here: https://marketplace.zoom.us/develop/create
 *  - Create a JWT and set jwt token expiry as per your need like 
 *    in the image: https://drive.google.com/file/d/181AUoYFZix_36qdsmoyeUH9vegYkhQKR/view?usp=sharing
 *  - Find your Zoom User ID
 *  - Once the constants mentioned below are provided, you can set Google Apps Script triggers like 
 *    in the image: https://drive.google.com/file/d/1f4_Lj81WgsMTO6FU5ZiUB69OVQKsfN-a/view?usp=sharing
 *
*/

const TOKEN = <YOUR ZOOM TOKEN HERE>
const USER_ID = <YOUR ZOOM USER ID HERE>
const FOLDER = <YOUR GOOGLE DRIVE FOLDER ID HERE>
const ZOOM_URL = 'https://api.zoom.us/v2'


const retrieveMeetingsFromZoom = async () => {
  var url = ZOOM_URL + '/users/' + USER_ID + '/recordings';

    var params = {
    'method': 'GET',
    'contentType': 'application/json',
    "headers": {
      "Content-Type": "application/json",
      'User-Agent': 'Zoom-Jwt-Request',
      "Authorization": `Bearer ${TOKEN}`
    }
  };

  var res = UrlFetchApp.fetch(url, params);
  var data = JSON.parse(res.getContentText());

  data.meetings.forEach(async meeting => {
    var meeting_id = meeting.id; // set meeting id for deleting later.
    var meeting_name = meeting.topic;
    var meeting_date = meeting.start_time;

    meeting.recording_files.forEach(async recording => {
      if (recording.file_type == "MP4" && recording.status == 'completed') {
        var folder_name = `${meeting_date.slice(0, 10)} ${meeting_name}`.replace(/ /gm, "_")
        Logger.log(`Meeting: ${meeting_name} is uploading...`)
        var file_name = `${folder_name}.${recording.file_extension}`
        await moveRecording(folder_name, file_name, recording.download_url, meeting_id)
      } else {
        recording.status == 'completed' 
          ? Logger.log(`${meeting_name} is in ${recording.status} with ${recording.file_extension}.`) 
          : Logger.log(`${meeting_name} Sound recording passed.`)
      }
    })
  })

}

const moveRecording = async (folder_name, file_name, download_url, meeting_id) => {
  var new_folder = await DriveApp.getFolderById(FOLDER).createFolder(folder_name).getId()
  Logger.log(`Folder: ${folder_name} created.`)
  var video = UrlFetchApp.fetch(download_url)
  await DriveApp.getFolderById(new_folder).createFile(video.getBlob()).setName(file_name)
  Logger.log(`Recording: ${file_name} uploaded.\n Starting to remove zoom cloud recording.`)
  await deleteRecordingFromZoom(meeting_id)
}


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
      Logger.log(`Meeting recording deleted.`)
      break;
    case 200:
      Logger.log(`You do not have the right permission`)
      break;
    case 404:
      Logger.log('There is no recording for this meeting.')
      break;
    case 400:
      Logger.log('Error Code: 1010 > User does not belong to this account.')
      break;
    default:
      Logger.log(`Deleting faced an unknown Error ${res}, ${data}`)
  }
}



