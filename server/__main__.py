import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

import server.application

if __name__ == "__main__":
    server.application.BUILD_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "frontend", "build")
    )
    print(">>", server.application.BUILD_DIR)
    server.application.main()
