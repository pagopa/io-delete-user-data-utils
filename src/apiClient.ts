import { ValidUrl } from "@pagopa/ts-commons/lib/url";
import nodeFetch from "node-fetch";
import { Client, createClient } from "./generated/io-api/client";

export const APIClient = ({
  fetchApi = nodeFetch as unknown as typeof fetch,
  ...clientParams
}: {
  readonly baseUrl: ValidUrl;
  readonly token: string;
  readonly fetchApi?: typeof fetch;
}): Client<"SubscriptionKey"> =>
  createClient<"SubscriptionKey">({
    basePath: "",
    baseUrl: clientParams.baseUrl.href,
    fetchApi,
    withDefaults: (op) => (params) =>
      op({
        ...params,
        // please refer to source api spec for actual header mapping
        // https://github.com/pagopa/io-functions-app/blob/master/openapi/index.yaml#:~:text=%20%20SubscriptionKey:
        SubscriptionKey: clientParams.token,
      }),
  });

export type APIClient = typeof APIClient;
