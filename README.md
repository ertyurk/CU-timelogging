# Integration between Airtable - Google Calander - Clickup 
    This script helps you to record your timelogs from airtable to clickup with your calendar events or any manual records in the Airtable if the area choosed as Work and timeLogStatus is Pending. 

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
