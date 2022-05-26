import { ITuple2 } from "@pagopa/ts-commons/lib/tuples";
import { ServiceResponse, TableUtilities } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import * as RA from "fp-ts/lib/ReadonlyArray";
import * as TE from "fp-ts/lib/TaskEither";
import { flow, pipe } from "fp-ts/lib/function";
import * as t from "io-ts";
import { toError } from "fp-ts/lib/Either";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import * as SEP from "fp-ts/lib/Separated";
import { fiscalCodesDataReader } from "./dataReader";
import { APIClient } from "./apiClient";
import { log } from "./utils/logger";

export interface IFailedUserDataProcessingEntity {
  readonly PartitionKey: TableUtilities.entityGenerator.EntityProperty<string>;
  readonly Reason: TableUtilities.entityGenerator.EntityProperty<string>;
  readonly RowKey: TableUtilities.entityGenerator.EntityProperty<string>;
}
export type InsertFailedUserDataProcessingEntityFn = (
  entityDescriptor: IFailedUserDataProcessingEntity
) => Promise<
  ITuple2<E.Either<Error, IFailedUserDataProcessingEntity>, ServiceResponse>
>;

const eg = TableUtilities.entityGenerator;

export const main = (
  API_CLIENT: ReturnType<APIClient>,
  insertFailedEntity: InsertFailedUserDataProcessingEntityFn,
  fiscalCodeDataReader: ReturnType<typeof fiscalCodesDataReader>
): Promise<E.Either<Error | t.Errors, ReadonlyArray<number>>> =>
  pipe(
    fiscalCodeDataReader(),
    (fiscalCodes) =>
      fiscalCodes.map((fiscalCode) =>
        pipe(
          TE.tryCatch(
            () =>
              insertFailedEntity({
                PartitionKey: eg.String(UserDataProcessingChoiceEnum.DELETE),
                Reason: eg.String("Delete user data with age less than 14yo"),
                RowKey: eg.String(fiscalCode),
              }),
            (err) =>
              // On failure the whole procedure is stopped.
              // Inserted table entity will be everridden by next execution
              // becouse the entity uniqueness is on the same PartitionKey - RowKey
              new Error(
                `Error inserting the failure for CF [${fiscalCode}]; Err: [${err}]`
              )
          ),
          TE.map((_) => ({ fiscalCode, insertFailedEntity: _ }))
        )
      ),
    RA.sequence(TE.ApplicativeSeq), // Execute all the async tasks sequentially
    TE.map(
      flow(
        RA.chain((_) => [
          {
            fiscalCode: _.fiscalCode,
            insertFailedEntity: _.insertFailedEntity.e1, // take only the first argument of the tuples
          },
        ]),
        RA.partitionMap((_) =>
          E.isRight(_.insertFailedEntity)
            ? E.right(_.fiscalCode)
            : E.left(_.fiscalCode)
        ),
        SEP.mapLeft(
          // log an error for each failed insert Failed User data
          RA.map((errorFiscalCode) =>
            log.error(
              `Error inserting Failed User data for FiscalCode: [${errorFiscalCode}}]`
            )
          )
        ),
        SEP.right
      )
    ),
    TE.map(
      RA.map((fiscalCode) =>
        pipe(
          TE.tryCatch(
            () =>
              API_CLIENT.upsertUserDataProcessing({
                body: {
                  choice: UserDataProcessingChoiceEnum.DELETE,
                },
                fiscal_code: fiscalCode,
              }),
            (err) =>
              new Error(
                `Error calling upsertUserDataProcessing FiscalCode: [${fiscalCode}] | Error: [${toError(
                  err
                )}]`
              )
          ), // For each fiscalCode create the upsertUserDataProcessing API call
          TE.chainW(TE.fromEither),
          TE.map((response) => ({ fiscalCode, response }))
        )
      )
    ),
    TE.chainW(RA.sequence(TE.ApplicativeSeq)), // Execute all the API calls sequentially
    TE.bimap(
      (err) => {
        log.error(`${err}]`);
        return err;
      },
      RA.map((_) => {
        log.info(
          `Status: [${_.response.status}] | FiscalCode: [${_.fiscalCode}]`
        ); // Log all the responses code
        return _.response.status;
      })
    )
  )();
