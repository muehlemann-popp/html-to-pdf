target "docker-metadata-action" {}

target "build" {
  inherits = ["docker-metadata-action"]
  context = "./"
  dockerfile = "deploy/Dockerfile"
  target = "prod"
  platforms = [
    "linux/386",
    "linux/amd64",
    "linux/arm64/v8",
  ]
}
