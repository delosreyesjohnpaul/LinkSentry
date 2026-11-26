FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /proxy .

FROM alpine:3.22
RUN addgroup -S proxy && adduser -S -G proxy proxy
COPY --from=build /proxy /proxy
USER proxy
EXPOSE 3128 8001
ENTRYPOINT ["/proxy"]
