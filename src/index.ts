import * as path from "path";
import { ITuple2, Tuple2 } from "@pagopa/ts-commons/lib/tuples";
import {
  createTableService,
  ServiceResponse,
  TableService,
} from "azure-storage";
import { Either, left, right } from "fp-ts/lib/Either";
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
import { log } from "./logger";
const fiscalCodeFilename = "fiscal_codes.txt";

/**
 * A promisified version of TableService.insertEntity
 */
export const insertTableEntity =
  (tableService: TableService, table: string) =>
  <T>(
    entityDescriptor: T
  ): Promise<ITuple2<Either<Error, T>, ServiceResponse>> =>
    new Promise((resolve) =>
      tableService.insertEntity(
        table,
        entityDescriptor,
        (
          error: Error,
          _: TableService.EntityMetadata,
          response: ServiceResponse
        ) =>
          resolve(
            response.isSuccessful
              ? Tuple2(right(entityDescriptor), response)
              : Tuple2(left(error), response)
          )
      )
    );

export type InsertTableEntity = ReturnType<typeof insertTableEntity>;

const config = getConfigOrThrow();
const connectionString = config.FailedUserDataProcessingStorageConnection;
const failedUserDataProcessingTable = config.FAILED_USER_DATA_PROCESSING_TABLE;
const failedUserDataProcessingService = createTableService(connectionString);
const insertTableEntityFn: InsertFailedUserDataProcessingEntityFn =
  insertTableEntity(
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
  insertTableEntityFn,
  fiscalCodesDataReader(path.join(__dirname, `../data/${fiscalCodeFilename}`))
).catch((err) => log.error(`The script execution failed Err [${err}]`));
