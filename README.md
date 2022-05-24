# Delete User Data

This project start the delete procedure for a list of fiscal_code provided in input from a text file.

The input file is located in `./data` folder.

The flow insert a record into the `FailedUserDataProcessing` table and call the `upsertUserDataProcessing` from the `io-functions-app`. The first operation is needed to avoid the time delay into the user data delete orchestration and skip the email notification of the deletion. The second operation start the standard delete procedure.