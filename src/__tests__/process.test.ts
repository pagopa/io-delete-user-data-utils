import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { Tuple2 } from "@pagopa/ts-commons/lib/tuples";
import { TableUtilities } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { APIClient } from "../apiClient";
import { UserDataProcessingChoiceEnum } from "../generated/io-api/UserDataProcessingChoice";
import { IFailedUserDataProcessingEntity, main } from "../process";
import * as RA from "fp-ts/lib/ReadonlyArray";

const eg = TableUtilities.entityGenerator;

const upsertUserDataProcessingSuccessImpl = (delay: number = 0) =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve(
          E.right({
            status: 200,
          })
        ),
      delay
    )
  );

const InsertFailedEntitySuccessImpl =
  (dealy: number = 0) =>
  (val: IFailedUserDataProcessingEntity) =>
    new Promise((resolve) => {
      setTimeout(
        () =>
          resolve(
            Tuple2(
              E.right({
                PartitionKey: val.PartitionKey._,
                Reason: val.Reason._,
                RowKey: val.RowKey._,
              }),
              {}
            )
          ),
        dealy
      );
    });
const upsertUserDataProcessing = jest
  .fn()
  .mockImplementation(upsertUserDataProcessingSuccessImpl);
const mockApiClient = {
  upsertUserDataProcessing,
} as unknown as ReturnType<APIClient>;
const mockInsertFailedEntity = jest.fn();
const mockFiscalCodeDataReader = jest.fn().mockImplementation(() => []);

const aFiscalCode = "AAAAAA00A00A000A" as FiscalCode;
const otherFiscalCodes = [
  "AAAAAA00A00A000B",
  "AAAAAA00A00A000C",
  "AAAAAA00A00A000D",
  "AAAAAA00A00A000E",
] as unknown as ReadonlyArray<FiscalCode>;

describe("index.ts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return an empty array if the data file is empty", async () => {
    const result = await main(
      mockApiClient,
      mockInsertFailedEntity,
      mockFiscalCodeDataReader
    );
    expect(result).toStrictEqual(E.right([]));
    expect(upsertUserDataProcessing).not.toBeCalled();
    expect(mockInsertFailedEntity).not.toBeCalled();
  });
  it("should success if valid fiscal_code is provided and table and cosmos query success", async () => {
    mockFiscalCodeDataReader.mockImplementationOnce(() => [aFiscalCode]);
    mockInsertFailedEntity.mockImplementationOnce(
      InsertFailedEntitySuccessImpl()
    );

    const result = await main(
      mockApiClient,
      mockInsertFailedEntity,
      mockFiscalCodeDataReader
    );

    expect(mockInsertFailedEntity).toBeCalledTimes(1);
    expect(mockInsertFailedEntity).toBeCalledWith({
      PartitionKey: eg.String(UserDataProcessingChoiceEnum.DELETE),
      Reason: expect.any(Object),
      RowKey: eg.String(aFiscalCode),
    });
    expect(upsertUserDataProcessing).toBeCalledTimes(1);
    expect(upsertUserDataProcessing).toBeCalledWith({
      body: {
        choice: UserDataProcessingChoiceEnum.DELETE,
      },
      fiscal_code: aFiscalCode,
    });
    expect(E.isRight(result)).toBeTruthy();
  });

  it("should call table and cosmos query on the same order of input", async () => {
    const inputFiscalCodes = [aFiscalCode, ...otherFiscalCodes];
    mockFiscalCodeDataReader.mockImplementationOnce(() => inputFiscalCodes);

    pipe(
      inputFiscalCodes,
      RA.map((_) => {
        const randomDelay = Math.random() * 100;
        mockInsertFailedEntity.mockImplementationOnce(
          InsertFailedEntitySuccessImpl(randomDelay)
        );
      })
    );

    const result = await main(
      mockApiClient,
      mockInsertFailedEntity,
      mockFiscalCodeDataReader
    );

    expect(mockInsertFailedEntity).toBeCalledTimes(inputFiscalCodes.length);
    expect(upsertUserDataProcessing).toBeCalledTimes(inputFiscalCodes.length);

    pipe(
      inputFiscalCodes,
      RA.mapWithIndex((index, fiscalCode) => {
        expect(mockInsertFailedEntity).toHaveBeenNthCalledWith(index + 1, {
          PartitionKey: eg.String(UserDataProcessingChoiceEnum.DELETE),
          Reason: expect.any(Object),
          RowKey: eg.String(fiscalCode),
        });
        expect(upsertUserDataProcessing).toHaveBeenNthCalledWith(index + 1, {
          body: {
            choice: UserDataProcessingChoiceEnum.DELETE,
          },
          fiscal_code: fiscalCode,
        });
      })
    );
    expect(E.isRight(result)).toBeTruthy();
  });

  it("should fail if one insert failed entity call fail", async () => {
    mockFiscalCodeDataReader.mockImplementationOnce(() => otherFiscalCodes);
    const lastElementIndex = otherFiscalCodes.length - 1;
    pipe(
      otherFiscalCodes,
      RA.mapWithIndex((index, _el) => {
        const randomDelay = Math.random() * 100;
        mockInsertFailedEntity.mockImplementationOnce(
          index === lastElementIndex
            ? () => Promise.reject(false)
            : InsertFailedEntitySuccessImpl(randomDelay)
        );
      })
    );
    const result = await main(
      mockApiClient,
      mockInsertFailedEntity,
      mockFiscalCodeDataReader
    );

    expect(mockInsertFailedEntity).toBeCalledTimes(otherFiscalCodes.length);
    expect(upsertUserDataProcessing).not.toBeCalled();

    expect(E.isLeft(result)).toBeTruthy();
  });

  it("should fail if one upsertUserDataProcessing fail", async () => {
    mockFiscalCodeDataReader.mockImplementationOnce(() => otherFiscalCodes);
    upsertUserDataProcessing.mockImplementationOnce(() =>
      upsertUserDataProcessingSuccessImpl(100)
    );
    upsertUserDataProcessing.mockImplementationOnce(() =>
      Promise.reject(new Error("API failure"))
    );
    pipe(
      otherFiscalCodes,
      RA.map((_) => {
        const randomDelay = Math.random() * 100;
        mockInsertFailedEntity.mockImplementationOnce(
          InsertFailedEntitySuccessImpl(randomDelay)
        );
      })
    );
    const result = await main(
      mockApiClient,
      mockInsertFailedEntity,
      mockFiscalCodeDataReader
    );

    expect(mockInsertFailedEntity).toBeCalledTimes(otherFiscalCodes.length);
    expect(upsertUserDataProcessing).toBeCalledTimes(2);
    expect(upsertUserDataProcessing).toHaveBeenNthCalledWith(1, {
      body: {
        choice: UserDataProcessingChoiceEnum.DELETE,
      },
      fiscal_code: otherFiscalCodes[0],
    });
    expect(upsertUserDataProcessing).toHaveBeenNthCalledWith(2, {
      body: {
        choice: UserDataProcessingChoiceEnum.DELETE,
      },
      fiscal_code: otherFiscalCodes[1],
    });
    expect(E.isLeft(result)).toBeTruthy();
  });

  it("should fail if one upsertUserDataProcessing return a validation error", async () => {
    mockFiscalCodeDataReader.mockImplementationOnce(() => otherFiscalCodes);
    upsertUserDataProcessing.mockImplementationOnce(() =>
      upsertUserDataProcessingSuccessImpl(100)
    );
    upsertUserDataProcessing.mockImplementationOnce(() =>
      Promise.resolve(E.left("Validation Error"))
    );
    pipe(
      otherFiscalCodes,
      RA.map((_) => {
        const randomDelay = Math.random() * 100;
        mockInsertFailedEntity.mockImplementationOnce(
          InsertFailedEntitySuccessImpl(randomDelay)
        );
      })
    );
    const result = await main(
      mockApiClient,
      mockInsertFailedEntity,
      mockFiscalCodeDataReader
    );

    expect(mockInsertFailedEntity).toBeCalledTimes(otherFiscalCodes.length);
    expect(upsertUserDataProcessing).toBeCalledTimes(2);
    expect(upsertUserDataProcessing).toHaveBeenNthCalledWith(1, {
      body: {
        choice: UserDataProcessingChoiceEnum.DELETE,
      },
      fiscal_code: otherFiscalCodes[0],
    });
    expect(upsertUserDataProcessing).toHaveBeenNthCalledWith(2, {
      body: {
        choice: UserDataProcessingChoiceEnum.DELETE,
      },
      fiscal_code: otherFiscalCodes[1],
    });
    expect(E.isLeft(result)).toBeTruthy();
  });
});
