# Delete User Data

This project start the delete procedure for a list of fiscal_code provided in input from a text file.

The input file must be located in `./data` folder.

The execution flow exec two steps:
1. Insert a record into the `FailedUserDataProcessing` table.
2. Call the `upsertUserDataProcessing` from the `io-functions-app`.

The first operation is needed to avoid the time delay into `UserDataDeleteOrchestratorV2` and skip the email notification to the user. The second operation start the standard delete procedure.