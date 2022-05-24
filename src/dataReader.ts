import fs from "fs";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import * as RA from "fp-ts/lib/ReadonlyArray";
import { log } from "./utils/logger";

/**
 * Read from a file a list of fiscal codes formatted one per line,
 * filter only valid fiscal code format strings and return a readonly array.
 *
 * @param filePath the path of the input file
 * @returns ReadonlyArray of valid fiscal codes
 */
export const fiscalCodesDataReader =
  (filePath: string): (() => ReadonlyArray<FiscalCode>) =>
  () =>
    pipe(
      fs.readFileSync(filePath),
      (_) => _.toString("utf-8"),
      (_) => _.split("\n"),
      RA.map((_) => {
        if (FiscalCode.is(_)) {
          return _;
        } else {
          log.warn(`Invalid FiscalCode format. Skipped! [${_}]`);
          return void 0;
        }
      }),
      RA.filter(FiscalCode.is)
    );
