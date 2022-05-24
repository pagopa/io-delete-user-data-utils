import { ITuple2, Tuple2 } from "@pagopa/ts-commons/lib/tuples";
import { ServiceResponse, TableService } from "azure-storage";
import * as E from "fp-ts/lib/Either";

/**
 * A promisified version of TableService.insertEntity
 */
export const insertOrReplaceTableEntity =
  (tableService: TableService, table: string) =>
  <T>(
    entityDescriptor: T
  ): Promise<ITuple2<E.Either<Error, T>, ServiceResponse>> =>
    new Promise((resolve) =>
      tableService.insertOrReplaceEntity(
        table,
        entityDescriptor,
        (
          error: Error,
          _: TableService.EntityMetadata,
          response: ServiceResponse
        ) =>
          resolve(
            response.isSuccessful
              ? Tuple2(E.right(entityDescriptor), response)
              : Tuple2(E.left(error), response)
          )
      )
    );

export type InsertOrReplaceTableEntity = ReturnType<
  typeof insertOrReplaceTableEntity
>;
