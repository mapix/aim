import collections

import grpc

class _GenericClientInterceptor(grpc.UnaryUnaryClientInterceptor,
                                grpc.UnaryStreamClientInterceptor,
                                grpc.StreamUnaryClientInterceptor,
                                grpc.StreamStreamClientInterceptor):

    def __init__(self, interceptor_function):
        self._fn = interceptor_function
        self.cookie = None

    def process_session_sticky(self, metadata):
        for metadatum in (metadata or []):
            if metadatum.key == 'set-cookie':
                self.cookie = metadatum.value

    def intercept_unary_unary(self, continuation, client_call_details, request):
        new_details, new_request_iterator, postprocess = self._fn(
            self.cookie,
            client_call_details, iter((request,)), False, False)
        response = continuation(new_details, next(new_request_iterator))
        self.process_session_sticky(response.initial_metadata())
        return postprocess(response) if postprocess else response

    def intercept_unary_stream(self, continuation, client_call_details,
                               request):
        new_details, new_request_iterator, postprocess = self._fn(
            self.cookie,
            client_call_details, iter((request,)), False, True)
        response_it = continuation(new_details, next(new_request_iterator))
        self.process_session_sticky(response_it.initial_metadata())
        return postprocess(response_it) if postprocess else response_it

    def intercept_stream_unary(self, continuation, client_call_details,
                               request_iterator):
        new_details, new_request_iterator, postprocess = self._fn(
            self.cookie,
            client_call_details, request_iterator, True, False)
        response = continuation(new_details, new_request_iterator)
        self.process_session_sticky(response.initial_metadata())
        return postprocess(response) if postprocess else response

    def intercept_stream_stream(self, continuation, client_call_details,
                                request_iterator):
        new_details, new_request_iterator, postprocess = self._fn(
            self.cookie,
            client_call_details, request_iterator, True, True)
        response_it = continuation(new_details, new_request_iterator)
        self.process_session_sticky(response_it.initial_metadata())
        return postprocess(response_it) if postprocess else response_it


def create(intercept_call):
    return _GenericClientInterceptor(intercept_call)


class _ClientCallDetails(
        collections.namedtuple(
            '_ClientCallDetails',
            ('method', 'timeout', 'metadata', 'credentials')),
        grpc.ClientCallDetails):
    pass


def client_auth_interceptor(value):

    def intercept_call(cookie, client_call_details, request_iterator, request_streaming, response_streaming):
        metadata = []
        if client_call_details.metadata is not None:
            metadata = list(client_call_details.metadata)
        metadata.append(('authorization', value))
        if cookie:
            metadata.append(('cookie', cookie))  
        client_call_details = _ClientCallDetails(
            client_call_details.method, client_call_details.timeout, metadata,
            client_call_details.credentials)
        return client_call_details, request_iterator, None

    return create(intercept_call)