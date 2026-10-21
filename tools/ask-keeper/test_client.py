import io,json,unittest,urllib.error
from unittest.mock import patch
import ask_keeper as c
class Tests(unittest.TestCase):
    def test_secret_validation(self):
        with self.assertRaises(c.ClientError):c.Client('short')
    def test_secret_in_header_only(self):
        client=c.Client('s'*64)
        class Opener:
            def open(self,req,timeout):
                self.req=req
                return io.BytesIO(json.dumps({'sources':[]}).encode())
        opener=Opener();client.opener=opener;client.request('search','Тест')
        self.assertNotIn('s'*64,opener.req.full_url);self.assertNotIn('s'*64,opener.req.data.decode())
        self.assertEqual(opener.req.get_header('X-max-bot-api-secret'),'s'*64)
    def test_error_body_not_reflected(self):
        client=c.Client('s'*64)
        class Opener:
            def open(self,*a,**k):raise urllib.error.HTTPError('url',503,'PRIVATE',{},io.BytesIO(b'{"error":"PRIVATE_SECRET"}'))
        client.opener=Opener()
        with self.assertRaises(c.ClientError) as cm:client.request('answer','Тест')
        self.assertNotIn('PRIVATE',str(cm.exception))
    def test_checks_do_not_call_model(self):
        class Fake:
            calls=[]
            def request(self,action,q,mode='forms'):
                self.calls.append(action)
                return {'sources':[{'text':'ПРОВЕРКА-СЕРВЕР-78'}] if mode=='literal' else []}
        fake=Fake()
        with patch('sys.stdout',new=io.StringIO()):c.check(fake)
        self.assertEqual(fake.calls,['search','search'])
    def test_safe_diagnostics(self):
        client=c.Client('s'*64)
        class Opener:
            def open(self,*a,**k):raise urllib.error.HTTPError('url',503,'PRIVATE',{},io.BytesIO(json.dumps({'error':'model_parameters','diagnostic':{'http_status':400,'code':'unsupported_parameter','param':'reasoning.effort'},'message':'PRIVATE'}).encode()))
        client.opener=Opener()
        with self.assertRaises(c.ClientError) as cm:client.request('answer','Тест')
        self.assertIn('HTTP 400; code=unsupported_parameter; param=reasoning.effort',str(cm.exception))
        self.assertNotIn('PRIVATE',str(cm.exception))
    def test_batch_runs_all_cases_with_fixed_questions(self):
        class Fake:
            def __init__(self):self.calls=[]
            def request(self,action,q,mode='forms'):
                self.calls.append((action,q))
                case=next(x for x in c.ACCEPTANCE_CASES if q==(x[2] if action=='search' else x[1]))
                sources=[{'ref':'S1','text':' '.join(case[3])}] if case[4] else []
                return {'sources':sources,'found':case[4],'answer':'Текст [S1]' if case[4] else 'Нет сведений','citations':['S1'] if case[4] else []}
        fake=Fake()
        with patch('sys.stdout',new=io.StringIO()):result=c.acceptance(fake)
        self.assertTrue(result)
        self.assertEqual(len(fake.calls),10)
        self.assertEqual(sum(action=='answer' for action,q in fake.calls),5)
    def test_batch_stops_on_provider_error_without_retry(self):
        class Fake:
            def __init__(self):self.calls=0
            def request(self,*a,**k):self.calls+=1;raise c.ClientError('Провайдер отказал')
        fake=Fake()
        with patch('sys.stdout',new=io.StringIO()):result=c.acceptance(fake)
        self.assertFalse(result);self.assertEqual(fake.calls,1)
    def test_batch_skips_model_when_positive_source_missing(self):
        class Fake:
            def __init__(self):self.actions=[]
            def request(self,action,q,mode='forms'):
                self.actions.append(action)
                return {'sources':[],'found':False,'answer':'Нет сведений','citations':[]}
        fake=Fake()
        with patch('sys.stdout',new=io.StringIO()):result=c.acceptance(fake)
        self.assertFalse(result)
        self.assertEqual(fake.actions.count('answer'),2)
    def test_assessment_detects_missing_source_and_wrong_citations(self):
        self.assertTrue(c.assess({'found':True,'sources':[],'answer':'Текст [S99]','citations':['S99']},('контроль',),True))
        self.assertTrue(c.assess({'found':True,'sources':[],'answer':'Выдумка','citations':[]},(),False))
if __name__=='__main__':unittest.main()
