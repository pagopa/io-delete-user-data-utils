import * as path from "path";
import { createTableService } from "azure-storage";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch,
} from "@pagopa/ts-commons/lib/fetch";
import { agent } from "@pagopa/ts-commons";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import { getConfigOrThrow } from "./config";
import { APIClient } from "./apiClient";
import { fiscalCodesDataReader } from "./dataReader";
import { InsertFailedUserDataProcessingEntityFn, main } from "./process";
import { log } from "./utils/logger";
import { insertOrReplaceTableEntity } from "./utils/tableStorage";
const fiscalCodeFilename = "fiscal_codes.txt";

const config = getConfigOrThrow();
const connectionString = config.FailedUserDataProcessingStorageConnection;
const failedUserDataProcessingTable = config.FAILED_USER_DATA_PROCESSING_TABLE;
const failedUserDataProcessingService = createTableService(connectionString);
const insertFailedUserDataProcessingEntityFn: InsertFailedUserDataProcessingEntityFn =
  insertOrReplaceTableEntity(
    failedUserDataProcessingService,
    failedUserDataProcessingTable
  );

const DEFAULT_REQUEST_TIMEOUT_MS = 10000 as Millisecond;

// Generic HTTP/HTTPS fetch with optional keepalive agent
// @see https://github.com/pagopa/io-ts-commons/blob/master/src/agent.ts#L10
const abortableFetch = AbortableFetch(agent.getFetch(process.env));
const fetchWithTimeout = setFetchTimeout(
  DEFAULT_REQUEST_TIMEOUT_MS,
  abortableFetch
);
const httpOrHttpsApiFetch = toFetch(fetchWithTimeout);

const API_KEY = config.API_KEY;
const API_URL = config.API_URL;
const FN_APP_API_CLIENT = APIClient(API_KEY, API_URL, httpOrHttpsApiFetch);

main(
  FN_APP_API_CLIENT,
  insertFailedUserDataProcessingEntityFn,
  fiscalCodesDataReader(path.join(__dirname, `../data/${fiscalCodeFilename}`))
).catch((err) => log.error(`The script execution failed Err [${err}]`));
