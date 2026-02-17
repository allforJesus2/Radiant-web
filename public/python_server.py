# Simple HTTP server to serve Radiant-web application

import http.server
import socketserver
import os

PORT = 8001
DIRECTORY = '.'

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
        
    # Override to serve files from the current directory
    def translate_path(self, path):
        return os.path.join(DIRECTORY, path)

def run_server():
    print(f"Starting server on port {PORT}")
    
    try:
        with socketserver.TCPServer(("", PORT), RequestHandler) as httpd:
            print(f"Serving at port {PORT}")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("Server stopped by user")

if __name__ == "__main__":
    run_server()
