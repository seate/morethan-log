import { NotionAPI } from "notion-client"
import { ExtendedRecordMap } from "notion-types"

export * from "./getRecordMap"
export * from "./getPosts"

// 전역 락: 모든 노션 API 호출은 이 프로미스 체인을 거쳐 순차적으로 실행됩니다.
let requestQueue = Promise.resolve()

export const notionApi = new NotionAPI()

export const queuedNotionId = async (fn: () => Promise<any>) => {
  const result = requestQueue.then(async () => {
    // 요청 간 최소 600ms 간격을 강제합니다.
    await new Promise((resolve) => setTimeout(resolve, 600))
    return fn()
  })
  requestQueue = result.catch(() => {}) // 에러가 나도 다음 큐는 진행되도록 함
  return result
}
