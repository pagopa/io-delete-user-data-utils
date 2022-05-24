import { ITuple2 } from "@pagopa/ts-commons/lib/tuples";
import { ServiceResponse, TableUtilities } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import * as RA from "fp-ts/lib/ReadonlyArray";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";
import { APIClient } from "./apiClient";
import * as t from "io-ts";
import { Either, isRight, toError } from "fp-ts/lib/Either";
import { fiscalCodesDataReader } from "./dataReader";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";

interface IFailedUserDataProcessingEntity {
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
        TE.tryCatch(
          () =>
            insertFailedEntity({
              PartitionKey: eg.String(UserDataProcessingChoiceEnum.DELETE),
              Reason: eg.String("Delete user data with age less than 14yo"),
              RowKey: eg.String(fiscalCode),
            }),
          (err) =>
            new Error(
              `Error inserting the failure for CF [${fiscalCode}]; Err: [${err}]`
            )
        )
      ),
    RA.sequence(TE.ApplicativeSeq), // Execute all the async tasks sequentially
    TE.map((_) => _.map((el) => el.e1)), // take only the first argument of the tuples
    TE.map((_) => _.filter(isRight).map((el) => el.right.RowKey)), // Take only the right values
    TE.chainEitherKW(t.readonlyArray(FiscalCode).decode), // Decode the RowKey array with FiscalCode decoder
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
            toError
          ), // For each fiscalCode create the upsertUserDataProcessing API call
          TE.chainW(TE.fromEither)
        )
      )
    ),
    TE.chainW(RA.sequence(TE.ApplicativeSeq)), // Execute all the API calls sequentially
    TE.bimap(
      (err) => {
        console.error(`Error executing the operation [${err}]`);
        return err;
      },
      RA.map((response) => {
        console.log(`Result response code: [${response.status}]`); // Log all the responses code
        return response.status;
      })
    )
  )();