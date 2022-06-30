#!/usr/bin/env python3
from impacket.examples.ntlmrelayx.utils.config import NTLMRelayxConfig
from impacket.ldap import ldaptypes

from pywerview.modules.ldapattack import LDAPAttack, ACLEnum, ADUser
from pywerview.modules.ca import CAEnum
from pywerview.modules.addcomputer import ADDCOMPUTER
from pywerview.utils.helpers import *

import ldap3
import logging
import re

class PywerView:

    def __init__(self, conn, args):
        self.conn = conn
        self.args = args
        self.username = args.username
        self.password = args.password
        self.domain = args.domain
        self.lmhash = args.lmhash
        self.nthash = args.nthash
        self.use_ldaps = args.use_ldaps
        self.dc_ip = args.dc_ip

        self.ldap_server, self.ldap_session = self.conn.init_ldap_session()

        cnf = ldapdomaindump.domainDumpConfig()
        cnf.basepath = None
        self.domain_dumper = ldapdomaindump.domainDumper(self.ldap_server, self.ldap_session, cnf)
        self.root_dn = self.domain_dumper.getRoot()
        self.fqdn = ".".join(self.root_dn.replace("DC=","").split(","))

    def get_domainuser(self, args=None, properties=['cn','name','sAMAccountName','distinguishedName','mail','description','lastLogoff','lastLogon','memberof','objectSid','userPrincipalName'], identity='*'):
        ldap_filter = ""
        
        if args:
            if args.preauthnotrequired:
                ldap_filter = f'(userAccountControl:1.2.840.113556.1.4.803:=4194304)'
            elif args.admincount:
                ldap_filter = f'(admincount=1)'
            elif args.allowdelegation:
                ldap_filter = f'!(userAccountControl:1.2.840.113556.1.4.803:=1048574)'
            elif args.trustedtoauth:
                ldap_filter = f'(msds-allowedtodelegateto=*)'
            elif args.spn:
                ldap_filter = f'(servicePrincipalName=*)'

        ldap_filter = f'(&(samAccountType=805306368)(|(sAMAccountName={identity})){ldap_filter})'

        logging.debug(f'LDAP search filter: {ldap_filter}')

        self.ldap_session.search(self.root_dn,ldap_filter,attributes=properties)
        return self.ldap_session.entries

    def get_domaincontroller(self, args=None, properties='*', identity='*'):
        ldap_filter = f'(userAccountControl:1.2.840.113556.1.4.803:=8192)'
        logging.debug(f'LDAP search filter: {ldap_filter}')
        self.ldap_session.search(self.root_dn,ldap_filter,attributes=properties)
        return self.ldap_session.entries

    def get_domainobject(self, args=None, properties='*', identity='*'):
        ldap_filter = f'(&(|(|(samAccountName={identity})(name={identity})(displayname={identity})(objectSid={identity})(distinguishedName={identity}))))'
        logging.debug(f'LDAP search filter: {ldap_filter}')
        self.ldap_session.search(self.root_dn,ldap_filter,attributes=properties)
        return self.ldap_session.entries

    def get_domainou(self, args=None, properties='*', identity='*'):
        ldap_filter = ""
        if args.gplink:
            ldap_filter += f"(gplink=*{args.gplink}*)"
        ldap_filter = f'(&(objectCategory=organizationalUnit)(|(name={identity})){ldap_filter})'
        logging.debug(f'LDAP search filter: {ldap_filter}')
        self.ldap_session.search(self.root_dn,ldap_filter,attributes=properties)
        return self.ldap_session.entries

    def get_domainobjectacl(self, args=None):
        #enumerate available guids
        guids_dict = {}
        self.ldap_session.search(f"CN=Extended-Rights,CN=Configuration,{self.root_dn}", "(rightsGuid=*)",attributes=['displayName','rightsGuid'])
        for entry in self.ldap_session.entries:
            guids_dict[entry['rightsGuid'].values[0]] = entry['displayName'].values[0]
        #self.ldap_session.search(f"CN=Schema,CN=Configuration,{self.root_dn}", "(schemaIdGuid=*)",attributes=['name','schemaIdGuid'])
        #for entry in self.ldap_session.entries:
        #    guids_dict[entry['schemaIdGuid'].values[0]] = entry['name'].values[0]
        setattr(args,"guids_map_dict",guids_dict)

        if args.security_identifier:
            principalsid_entry = self.get_domainobject(identity=args.security_identifier,properties=['objectSid'])
            if not principalsid_entry:
                logging.error(f'Principal Target {args.security_identifier} not found in domain')
                return
            args.security_identifier = principalsid_entry[0]['objectSid'].values[0]

        entries = self.get_domainobject(identity=f'{args.identity if args.identity else "*"}',properties=['sAMAccountName','nTSecurityDescriptor','distinguishedName','objectSid'])

        if not entries:
            logging.error(f'Identity not found in domain')
            return

        enum = ACLEnum(entries, self.ldap_session, self.root_dn, args)
        entries_dacl = enum.read_dacl()
        return entries_dacl

    def get_domaincomputer(self, args=None, properties='*', identity='*'):
        ldap_filter = ""

        if args:
            if args.unconstrained:
                ldap_filter = f'(userAccountControl:1.2.840.113556.1.4.803:=524288)'
            elif args.trustedtoauth:
                ldap_filter = f'(msds-allowedtodelegateto=*)'
            elif args.laps:
                ldap_filter = f'(ms-MCS-AdmPwd=*)'

        ldap_filter = f'(&(samAccountType=805306369)(|(name={identity})){ldap_filter})'

        logging.debug(f'LDAP search filter: {ldap_filter}')

        self.ldap_session.search(self.root_dn,ldap_filter,attributes=properties)
        return self.ldap_session.entries

    def get_domaingroup(self, args=None, properties='*', identity='*'):
        ldap_filter = f'(&(objectCategory=group)(|(|(samAccountName={identity})(name={identity}))))'
        logging.debug(f'LDAP search filter: {ldap_filter}')
        self.ldap_session.search(self.root_dn,ldap_filter,attributes=properties)
        return self.ldap_session.entries

    def get_domaingpo(self, args=None, properties='*', identity='*'):
        ldap_filter = f'(&(objectCategory=groupPolicyContainer)(cn={identity}))'
        logging.debug(f'LDAP search filter: {ldap_filter}')
        self.ldap_session.search(self.root_dn,ldap_filter,attributes=properties)
        return self.ldap_session.entries

        ldap_filter = ""
        if args.gplink:
            ldap_filter += f'(gplink={args.gplink})'

        ldap_filter = f'(&(objectCategory=organizationalUnit)(|(name={identity})){ldap_filter})'

        logging.debug(f'LDAP search filter: {ldap_filter}')

        self.ldap_session.search(self.root_dn,ldap_filter,attributes=properties)
        return self.ldap_session.entries

    def get_domaintrust(self, args=None, properties='*', identity='*'):
        ldap_filter = f'(objectClass=trustedDomain)'
        logging.debug(f'LDAP search filter: {ldap_filter}')
        self.ldap_session.search(self.root_dn,ldap_filter,attributes=properties)
        return self.ldap_session.entries

    def get_domain(self, args=None, properties='*', identity='*'):
        ldap_filter = f'(objectClass=domain)'
        logging.debug(f'LDAP search filter: {ldap_filter}')
        self.ldap_session.search(self.root_dn,ldap_filter,attributes=properties)
        return self.ldap_session.entries

    def get_domainca(self, args=None, properties='*'):
        ca_fetch = CAEnum(self.ldap_session, self.root_dn)
        entries = ca_fetch.fetch_enrollment_services(properties)
        return entries

    def add_domaingroupmember(self, identity, members, args=None):
        group_entry = self.get_domaingroup(identity=identity,properties='distinguishedName')
        user_entry = self.get_domainobject(identity=members,properties='distinguishedName')
        if len(group_entry) == 0:
            logging.error(f'Group {identity} not found in domain')
            return
        if len(user_entry) == 0:
            logging.error(f'User {members} not found in domain')
            return
        targetobject = group_entry[0]
        userobject = user_entry[0]
        succeeded = self.ldap_session.modify(targetobject.entry_dn,{'member': [(ldap3.MODIFY_ADD, [userobject.entry_dn])]})
        if not succeeded:
            print(self.ldap_session.result['message'])
        return succeeded

    def remove_domaingroupmember(self, identity, members, args=None):
        group_entry = self.get_domaingroup(identity=identity,properties='distinguishedName')
        user_entry = self.get_domainobject(identity=members,properties='distinguishedName')
        if len(group_entry) == 0:
            logging.error(f'Group {identity} not found in domain')
            return
        if len(user_entry) == 0:
            logging.error(f'User {members} not found in domain')
            return
        targetobject = group_entry[0]
        userobject = user_entry[0]
        succeeded = self.ldap_session.modify(targetobject.entry_dn,{'member': [(ldap3.MODIFY_DELETE, [userobject.entry_dn])]})
        if not succeeded:
            print(self.ldap_session.result['message'])
        return succeeded

    def remove_domainuser(self, identity):
        if not identity:
            logging.error('Identity is required')
            return
        entries = self.get_domainuser(identity=identity)
        if len(entries) == 0:
            logging.error('Identity not found in domain')
            return
        identity_dn = entries[0].entry_dn
        au = ADUser(self.ldap_session, self.root_dn)
        au.removeUser(identity_dn)

    def add_domainuser(self, username, userpass):
        if not self.use_ldaps:
            logging.error('Adding a user account to the domain requires TLS but ldap:// scheme provided. Switching target to LDAPS via StartTLS')
            return

        parent_dn_entries = self.get_domainobject(identity="Users")
        if len(parent_dn_entries) == 0:
            logging.error('Users parent DN not found in domain')
            return
        au = ADUser(self.ldap_session, self.root_dn, parent = parent_dn_entries[0].entry_dn)
        if au.addUser(username, userpass):
            return True
        else:
            return False

    def add_domainobjectacl(self, args):
        c = NTLMRelayxConfig()
        c.addcomputer = 'idk lol'
        c.target = self.dc_ip

        setattr(args, "delete", False)

        if '\\' not in args.principalidentity or '/' not in args.principalidentity:
            username = f'{self.domain}/{args.principalidentity}'
        else:
            username = args.principalidentity

        principal_entries = self.get_domainobject(identity=args.principalidentity)
        if len(principal_entries) == 0:
            logging.error('Principal Identity object not found in domain')
            return
        principalidentity_dn = principal_entries[0].entry_dn
        principalidentity_sid = principal_entries[0]['ObjectSid'].values[0]
        setattr(args,'principalidentity_dn', principalidentity_dn)
        setattr(args,'principalidentity_sid', principalidentity_sid)
        logging.info(f'Found principal identity dn {principalidentity_dn}')

        target_entries = self.get_domainobject(identity=args.targetidentity)
        if len(target_entries) == 0:
            logging.error('Target Identity object not found in domain')
            return
        targetidentity_dn = target_entries[0].entry_dn
        targetidentity_sid = target_entries[0]['ObjectSid'].values[0]
        setattr(args,'targetidentity_dn', targetidentity_dn)
        setattr(args,'targetidentity_sid', targetidentity_sid)
        logging.info(f'Found target identity dn {targetidentity_dn}')

        logging.info(f'Adding {args.rights} privilege to {args.targetidentity}')
        la = LDAPAttack(config=c, LDAPClient=self.ldap_session, username=username, root_dn=self.root_dn, args=args)
        if args.rights in ['all','dcsync','writemembers','resetpassword']:
            la.aclAttack()
        elif args.rights in ['rbcd']:
            la.delegateAttack()
        elif args.rights in ['shadowcred']:
            la.shadowCredentialsAttack()

    def remove_domainobjectacl(self, args):
        c = NTLMRelayxConfig()
        c.addcomputer = 'idk lol'
        c.target = self.dc_ip

        setattr(args, "delete", True)

        if '\\' not in args.principalidentity or '/' not in args.principalidentity:
            username = f'{self.domain}/{args.principalidentity}'
        else:
            username = args.principalidentity

        principal_entries = self.get_domainobject(identity=args.principalidentity)
        if len(principal_entries) == 0:
            logging.error('Principal Identity object not found in domain')
            return
        principalidentity_dn = principal_entries[0].entry_dn
        principalidentity_sid = principal_entries[0]['ObjectSid'].values[0]
        setattr(args,'principalidentity_dn', principalidentity_dn)
        setattr(args,'principalidentity_sid', principalidentity_sid)
        logging.info(f'Found principal identity dn {principalidentity_dn}')

        target_entries = self.get_domainobject(identity=args.targetidentity)
        if len(target_entries) == 0:
            logging.error('Target Identity object not found in domain')
            return
        targetidentity_dn = target_entries[0].entry_dn
        targetidentity_sid = target_entries[0]['ObjectSid'].values[0]
        setattr(args,'targetidentity_dn', targetidentity_dn)
        setattr(args,'targetidentity_sid', targetidentity_sid)
        logging.info(f'Found target identity dn {targetidentity_dn}')
        entries = self.get_domainobject(identity=args.principalidentity)
        if len(entries) == 0:
            logging.error('Target object not found in domain')
            return

        logging.info(f'Restoring {args.rights} privilege on {args.targetidentity}')
        la = LDAPAttack(config=c, LDAPClient=self.ldap_session, username=username, root_dn=self.root_dn, args=args)
        la.aclAttack()


    def remove_domaincomputer(self,computer_name):
        if computer_name[-1] != '$':
            computer_name += '$'

        dcinfo = get_dc_host(self.ldap_session, self.domain_dumper, self.args)
        if len(dcinfo)== 0:
            logging.error("Cannot get domain info")
            exit()
        c_key = 0
        dcs = list(dcinfo.keys())
        if len(dcs) > 1:
            logging.info('We have more than one target, Pls choices the hostname of the -dc-ip you input.')
            cnt = 0
            for name in dcs:
                logging.info(f"{cnt}: {name}")
                cnt += 1
            while True:
                try:
                    c_key = int(input(">>> Your choice: "))
                    if c_key in range(len(dcs)):
                        break
                except Exception:
                    pass
        dc_host = dcs[c_key].lower()

        setattr(self.args, "dc_host", dc_host)
        setattr(self.args, "delete", True)

        if self.args.use_ldaps:
            setattr(self.args, "method", "LDAPS")
        else:
            setattr(self.args, "method", "SAMR")

        # Creating Machine Account
        addmachineaccount = ADDCOMPUTER(
            self.args.username,
            self.args.password,
            self.args.domain,
            self.args,
            computer_name)
        addmachineaccount.run()

        if len(self.get_domainobject(identity=computer_name)) == 0:
            return True
        else:
            return False


    def add_domaincomputer(self, computer_name, computer_pass):
        if computer_name[-1] != '$':
            computer_name += '$'
        dcinfo = get_dc_host(self.ldap_session, self.domain_dumper, self.args)
        if len(dcinfo)== 0:
            logging.error("Cannot get domain info")
            exit()
        c_key = 0
        dcs = list(dcinfo.keys())
        if len(dcs) > 1:
            logging.info('We have more than one target, Pls choices the hostname of the -dc-ip you input.')
            cnt = 0
            for name in dcs:
                logging.info(f"{cnt}: {name}")
                cnt += 1
            while True:
                try:
                    c_key = int(input(">>> Your choice: "))
                    if c_key in range(len(dcs)):
                        break
                except Exception:
                    pass
        dc_host = dcs[c_key].lower()

        setattr(self.args, "dc_host", dc_host)
        setattr(self.args, "delete", False)

        if self.args.use_ldaps:
            setattr(self.args, "method", "LDAPS")
        else:
            setattr(self.args, "method", "SAMR")

        # Creating Machine Account
        addmachineaccount = ADDCOMPUTER(
            self.username,
            self.password,
            self.domain,
            self.args,
            computer_name,
            computer_pass)
        addmachineaccount.run()

        if self.get_domainobject(identity=computer_name)[0].entry_dn:
            return True
        else:
            return False

    def set_domainobject(self,identity, args=None):
        targetobject = self.get_domainobject(identity=identity)
        if len(targetobject) > 1:
            logging.error('More than one object found')
            return False

        if args.clear:
            logging.info('Printing object before clearing')
            logging.info(f'Found target object {targetobject[0].entry_dn}')
            succeeded = self.ldap_session.modify(targetobject[0].entry_dn, {args.clear: [(ldap3.MODIFY_REPLACE,[])]})
        elif args.set:
            attrs = self.parse_object(args.set)
            if not attrs:
                return
            logging.info('Printing object before modifying')
            logging.info(f'Found target object {targetobject[0].entry_dn}')
            succeeded = self.ldap_session.modify(targetobject[0].entry_dn, {attrs['attr']:[(ldap3.MODIFY_REPLACE,[attrs['val']])]})

        if not succeeded:
            logging.error(self.ldap_session.result['message'])
        else:
            logging.info('Success! modified attribute for target object')

        return succeeded

    def get_shares(self, args):
        if args.computer:
            if is_ipaddress(args.computer):
                host = args.computer
            else:
                host = host2ip(args.computer, self.dc_ip, 3, True)
        elif args.computername:
            if is_ipaddress(args.computername):
                host = args.computername
            else:
                host = host2ip(args.computername, self.dc_ip, 3, True)
        else:
            logging.error(f'-Computer or -ComputerName is required')
            return

        if not host:
            return

        client = self.conn.init_smb_session(host)

        if not client:
            return

        shares = client.listShares()
        share_infos = []

        print(f'{"Name".ljust(15)}{"Remark".ljust(25)}ComputerName')
        print(f'{"----".ljust(15)}{"-------".ljust(25)}------------')
        for i in range(len(shares)):
            share_name = shares[i]['shi1_netname'][:-1]
            share_remark = shares[i]['shi1_remark'][:-1]
            share_info = {'name': share_name, 'remark': share_remark}
            share_infos.append(share_info)

            print(f'{share_info["name"].ljust(15)}{share_info["remark"].ljust(25)}{host}')
        print()

    def parse_object(self,obj):
        if '{' not in obj and '}' not in obj:
            logging.error('Error format retrieve, (e.g. {dnsHostName=temppc.contoso.local})')
            return None
        attrs = dict()
        try:
            regex = r'\{(.*?)\}'
        except:
            raise Exception('Error regex parsing')
        res = re.search(regex,obj)
        dd = res.group(1).replace("'","").replace('"','').split("=")
        attrs['attr'] = dd[0].strip()
        attrs['val'] = dd[1].strip()
        return attrs
