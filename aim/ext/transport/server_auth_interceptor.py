import grpc
import os
import traceback
from base64 import b64decode

PUBLIC_KEY = os.getenv('AIM_AUTH_PUBLIC_KEY')
AUDIENCE = os.getenv('AIM_AUTH_AUDIENCE')
ALGO = os.getenv('AIM_AUTH_ALGO', 'RS256')
wrapped_public_key = f"""-----BEGIN PUBLIC KEY-----\n{PUBLIC_KEY}\n-----END PUBLIC KEY-----"""

def load_basic_users():
    users = {}
    if os.getenv('AIM_AUTH_HTPASSWD_FILE'):
        with open(os.getenv('AIM_AUTH_HTPASSWD_FILE')) as f:
            for record in filter(None, map(lambda x: x.strip(), f.readlines())):
                username, parts = record.split(':')
                salt = parts.split('/')[0]
                users[username.encode('utf-8')] = (salt.encode('utf-8'), parts.encode('utf-8'))
    return users

users = load_basic_users()


class ServerAuthInterceptor(grpc.ServerInterceptor):
    def __init__(self):
        def deny(_, context):
            context.abort(grpc.StatusCode.UNAUTHENTICATED, 'Invalid Credentials')
        self._deny = grpc.unary_unary_rpc_method_handler(deny)

    def intercept_service(self, continuation, handler_call_details):
        import jwt
        import bcrypt
        metas = handler_call_details.invocation_metadata
        for metadatum in metas:
            if metadatum.key == 'authorization':
                try:
                    if metadatum.value.startswith('Bearer '):
                        token = metadatum.value.split(maxsplit=1)[1]
                        jwt.decode(token, wrapped_public_key, audience=AUDIENCE, algorithms=ALGO)
                    elif metadatum.value.startswith('Basic '):
                        cr = metadatum.value.split(maxsplit=1)[1].encode('utf-8')
                        username, password = b64decode(cr).split(b':', maxsplit=1)
                        if username in users:
                            salt, parts = users[username]
                            if bcrypt.hashpw(password, salt) != parts:
                                return self._deny
                        else:
                            return self._deny
                    return continuation(handler_call_details)
                except Exception as e:    
                    traceback.print_exc()
                    return self._deny
        return self._deny