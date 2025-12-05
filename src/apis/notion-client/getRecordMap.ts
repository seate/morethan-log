import { NotionAPI } from "notion-client"

const RETRY_COUNT = 3
const RETRY_DELAY = 1000 // 1s

export const getRecordMap = async (pageId: string) => {
  const api = new NotionAPI()

  for (let i = 0; i < RETRY_COUNT; i++) {
    try {
      const recordMap = await api.getPage(pageId)
      return recordMap
    } catch (error) {
      console.log(`Failed to fetch page ${pageId}, attempt ${i + 1}/${RETRY_COUNT}`)
      if (i < RETRY_COUNT - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
      } else {
        throw error
      }
    }
  }
}
