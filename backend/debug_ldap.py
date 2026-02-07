import socket
import sys
from ldap3 import Server, Connection, ALL, NTLM

HOST = "79.36.174.172"
PORT = 389
USER = "Administrator@example.internal"
PASS = "Role_Mining"
DOMAIN = "example.internal"

def test_socket(port):
    print(f"Testing TCP connection to {HOST}:{port}...")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10) # 10 seconds timeout
    try:
        s.connect((HOST, port))
        print(f"  [PASS] Connected to port {port}")
        s.close()
        return True
    except Exception as e:
        print(f"  [FAIL] Failed to connect to port {port}: {e}")
        return False

def test_ldap_bind(use_ssl=False):
    port = 636 if use_ssl else 389
    print(f"\nTesting LDAP Bind (SSL={use_ssl})...")
    
    try:
        server = Server(HOST, port=port, use_ssl=use_ssl, get_info=ALL)
        conn = Connection(server, user=USER, password=PASS, auto_bind=True)
        print(f"  [PASS] Bind Success!")
        print(conn)
        return True
    except Exception as e:
        print(f"  [FAIL] Bind Failed: {e}")
        return False

if __name__ == "__main__":
    tcp_389 = test_socket(389)
    tcp_636 = test_socket(636)
    
    if tcp_389:
        test_ldap_bind(use_ssl=False)
    
    if tcp_636:
        test_ldap_bind(use_ssl=True)
