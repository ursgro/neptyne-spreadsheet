# Load testing with locust

`locustfile.py` is intended to be used with [locust](https://github.com/locustio/locust) for load
testing. To use it, from the repo root, run

```bash
pip install locust
locust -f stress_test/locustfile.py
```

which will start a web server at http://localhost:8089. From here, you can initiate a load test
pointing at the relevant host and setting a number of synthetic users.
