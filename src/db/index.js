let repositoryPromise = null

async function createRepository() {
  const { createApiRepository } = await import('./remote/repo.api')
  return createApiRepository()
}

export function getRepository() {
  if (!repositoryPromise) {
    repositoryPromise = createRepository().catch((error) => {
      repositoryPromise = null
      throw error
    })
  }
  return repositoryPromise
}

export function isLiveMode() {
  return true
}

export const dataSource = 'api'
