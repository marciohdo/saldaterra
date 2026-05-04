require('../load-env');

const BASE = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_KEY;

const HEADERS = {
  'Content-Type': 'application/json',
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

// Capacidade: 0 = lotado (excluído da busca), null = pode receber visitantes
const pgs = [
  { LIDER: 'Alessandro Ferreira',                  CONTATO: '3492397030',   ENDEREÇO: 'Rua Dona Josefina de Oliveira Silva,262',                                    BAIRRO: 'Roosevelt',        'DIA DO PG': 'Segunda-feira', HORARIO: '20h00', REDE: 'S.Ensino',       PERFIL: 'Casais',      CIDADE: 'Uberlândia', Capacidade: 0    },
  { LIDER: 'Alexandre Simão da Silva',              CONTATO: '34984187233',  ENDEREÇO: 'Rua Lisboa, 470 - Casa 2',                                                   BAIRRO: 'Tibery',           'DIA DO PG': 'Sexta-feira',   HORARIO: '20h00', REDE: 'S.Teens',        PERFIL: 'Jovens',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Alonso Sepulveda Castelanos',           CONTATO: '3498877712',   ENDEREÇO: 'Av. Marcos de Freitas Costa, 553',                                           BAIRRO: 'Daniel Fonseca',   'DIA DO PG': 'Sábado',        HORARIO: '09h30', REDE: 'S.Kids',         PERFIL: 'Kids',        CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Alonso Sepulveda Castelanos',           CONTATO: '3498877712',   ENDEREÇO: 'Rua Itabira, 649',                                                           BAIRRO: 'Daniel Fonseca',   'DIA DO PG': 'Quinta-Feira',  HORARIO: '19h30', REDE: 'S.Kids',         PERFIL: 'Casais',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Amanda Cristiny Rosário Soares',        CONTATO: '34992078228',  ENDEREÇO: 'Av. Marcos de Freitas Costa, 553',                                           BAIRRO: 'Daniel Fonseca',   'DIA DO PG': 'Segunda-feira', HORARIO: '18h30', REDE: 'S.Kids',         PERFIL: 'Kids',        CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Ana Carolina',                          CONTATO: '3492317556',   ENDEREÇO: 'Av. Maria Silva Garcia, 286 - Lj 035',                                       BAIRRO: 'Granja Marileusa', 'DIA DO PG': 'Sábado',        HORARIO: '09h00', REDE: 'S.Adoração',     PERFIL: 'Kids',        CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Ana Carolina Cardoso',                  CONTATO: '34998740094',  ENDEREÇO: 'Av. Getúlio Vargas 2423 apt 101 bloco 3',                                    BAIRRO: 'Tubalina',         'DIA DO PG': 'Quinta-feira',  HORARIO: '19h00', REDE: 'S.Mulheres',     PERFIL: 'Mulheres',    CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'André Luís Melo Lopes',                 CONTATO: '34998915005',  ENDEREÇO: 'Rua dos pica paus 1050',                                                     BAIRRO: 'Nova Uberlandia',  'DIA DO PG': 'Terça-feira',   HORARIO: '20h00', REDE: 'S.Homens',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Ariane Fernandes',                      CONTATO: '34992364994',  ENDEREÇO: 'Rua Antonio Francisco Rosa 231',                                             BAIRRO: 'Aclimação',        'DIA DO PG': 'Quarta-feira',  HORARIO: '17h30', REDE: 'S.Kids',         PERFIL: 'Kids',        CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Artur Gonçalves Silva',                 CONTATO: '3499443172',   ENDEREÇO: 'Av. Tomazinho Rezende,749',                                                  BAIRRO: 'Daniel Fonseca',   'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Teens',        PERFIL: 'Teens',       CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Artur Gonçalves Silva',                 CONTATO: '3499443172',   ENDEREÇO: 'Rua Geraldo Francisco da Cruz 100',                                          BAIRRO: 'Chacaras Tubalina','DIA DO PG': 'Quarta-feira',  HORARIO: '19h30', REDE: 'S.Teens',        PERFIL: 'Teens',       CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Bruno Dias dos Santos',                 CONTATO: '34998258133',  ENDEREÇO: 'Av. Marcos de Freitas Costa, 553',                                           BAIRRO: 'Daniel Fonseca',   'DIA DO PG': 'Segunda-feira', HORARIO: '18h30', REDE: 'S.Kids',         PERFIL: 'Kids',        CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Bruno Dias dos Santos',                 CONTATO: '34998258133',  ENDEREÇO: 'Rua Eduardo Marques 909, apto 402',                                          BAIRRO: 'Martins',          'DIA DO PG': 'Segunda-feira', HORARIO: '20h00', REDE: 'S.Kids',         PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Cintia Kopper',                         CONTATO: '34998015499',  ENDEREÇO: 'Rua Nagel 33',                                                               BAIRRO: 'Vila Leopoldina',  'DIA DO PG': 'Sexta-feira',   HORARIO: '16h00', REDE: 'S.Teens',        PERFIL: 'Teens',       CIDADE: 'São Paulo',  Capacidade: null },
  { LIDER: 'Cleber Cesar filho',                    CONTATO: '3499918128',   ENDEREÇO: 'Tv. Beja 50 - Village Paradiso, Casa 02',                                    BAIRRO: 'Granja Marileusa', 'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Teens',        PERFIL: 'Teens',       CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Calebe Barbosa de Castro',              CONTATO: '3484015750',   ENDEREÇO: 'Av. João Pinheiro 5146',                                                     BAIRRO: 'Alto Umuarama',    'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Teens',        PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Carolina Santos Resende',               CONTATO: '3491425982',   ENDEREÇO: 'Rua Virgílio Melo Franco 160',                                               BAIRRO: 'Tabajaras',        'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Kids',         PERFIL: 'Kids',        CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Diogo Fernandes dos Santos',            CONTATO: '34992364999',  ENDEREÇO: 'Av. Antonio Francisco Rosa, 231',                                            BAIRRO: 'Aclimação',        'DIA DO PG': 'Quinta-feira',  HORARIO: '20h00', REDE: 'S.Homens',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Diogo Vasco',                           CONTATO: '6282438853',   ENDEREÇO: '',                                                                           BAIRRO: 'Setor Goiania 2',  'DIA DO PG': '',              HORARIO: '',      REDE: '',               PERFIL: 'Familia',     CIDADE: 'Goiânia',    Capacidade: null },
  { LIDER: 'Edna Pereira Ferreira',                 CONTATO: '34996852100',  ENDEREÇO: 'Rua Urca 55 AP. 302',                                                        BAIRRO: 'Patrimônio',       'DIA DO PG': 'Quarta-feira',  HORARIO: '16h00', REDE: 'Social',         PERFIL: 'Melhor Idade',CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Elielson e Ariane',                     CONTATO: '3492841212',   ENDEREÇO: 'Rua João Pedro Ferreira, 190',                                               BAIRRO: 'Aclimação',        'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Adoração',     PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Emanuel Bueno Sepúlveda Castellanos',   CONTATO: '34999947712',  ENDEREÇO: 'Rua Angra dos Reis 122',                                                     BAIRRO: 'Granada',          'DIA DO PG': 'Sábado',        HORARIO: '18h00', REDE: 'S.Kids',         PERFIL: 'Teens',       CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Evandro Pietro',                        CONTATO: '3492339915',   ENDEREÇO: 'Rua Lapa do Lobo, 1250 - Cond. Alphaville Uberlandia I',                    BAIRRO: 'Granja Marileusa', 'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Midias',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Fabiano e Sandra',                      CONTATO: '3499711001',   ENDEREÇO: 'Rua José Elias, 50 Apto-1802b - Triard Concord',                            BAIRRO: 'Karaiba',          'DIA DO PG': 'Segunda-feira', HORARIO: '19h45', REDE: 'S.Casais',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Fabiano Paiva',                         CONTATO: '3498096868',   ENDEREÇO: 'Rua Coronel Antonio alves pereira 1046',                                     BAIRRO: 'Centro',           'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Ensino',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Gabriel Robles De Cesero',              CONTATO: '3499710766',   ENDEREÇO: 'Rua dos Pica-Paus, 1750 Jardins Roma, Alameda dos Camarás, 30',             BAIRRO: 'Nova Uberlandia',  'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Casais',       PERFIL: 'Casais',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Gilberto Guimarães de Faria',           CONTATO: '34991232333',  ENDEREÇO: 'Av Sândalo,385',                                                             BAIRRO: 'Jaraguaá',         'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Diaconia',     PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Guilherme Pina',                        CONTATO: '6282579321',   ENDEREÇO: '',                                                                           BAIRRO: 'Setor Bueno',      'DIA DO PG': '',              HORARIO: '',      REDE: '',               PERFIL: 'Familia',     CIDADE: 'Goiânia',    Capacidade: null },
  { LIDER: 'Hugo Vilela',                           CONTATO: '3498060025',   ENDEREÇO: 'Av. Vereador Carlito Cordeiro,2315 - Cond. Esplendido',                     BAIRRO: 'Jardim Botânico',  'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Ensino',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Jefferson Dias',                        CONTATO: '34984420335',  ENDEREÇO: 'Rua Caio Graco, 263',                                                        BAIRRO: 'Vila Romana',      'DIA DO PG': 'Sábado',        HORARIO: '17h00', REDE: 'S.Adoração',     PERFIL: 'Jovens',      CIDADE: 'São Paulo',  Capacidade: null },
  { LIDER: 'João Basílio',                          CONTATO: '34991395575',  ENDEREÇO: 'Rua do mecânico 1329 casa 2',                                                BAIRRO: 'Planalto',         'DIA DO PG': 'Segunda-feira', HORARIO: '20h00', REDE: 'S.Jovens',       PERFIL: 'Jovens',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Juliano Neves Borges',                  CONTATO: '34991413951',  ENDEREÇO: 'Rua berlim 270',                                                             BAIRRO: 'Jd.Europa',        'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Oração',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Leandro Bastos',                        CONTATO: '3498849292',   ENDEREÇO: 'Rua Xavantes, 1056 - Apto 1502',                                            BAIRRO: 'Lídice',           'DIA DO PG': 'Quarta-feira',  HORARIO: '20h00', REDE: 'S.Adoração',     PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Lucas e Milena Martins',                CONTATO: '3496917795',   ENDEREÇO: 'Rua Ismael Gomes da Silva, 102',                                            BAIRRO: 'Alto Umuarama',    'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Casais',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Luciana Ribeiro de Oliveira de Marcello', CONTATO: '34999712881', ENDEREÇO: 'Av. Landscape 970 - Condomínio Cyrela Ipês - Alameda Anaça 150',          BAIRRO: 'Jd.Sul',           'DIA DO PG': 'Segunda-feira', HORARIO: '18h00', REDE: 'S.Kids',         PERFIL: 'Kids',        CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Luciano Pereira Gonçalves',             CONTATO: '34992027900',  ENDEREÇO: 'Av Vereador Carlito Cordeiro, 2.315 Cd Splendido, rua 5, 386',             BAIRRO: 'Laranjeiras',      'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'Social',         PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Luís Fernando Santos de Marcello',      CONTATO: '3499772176',   ENDEREÇO: 'Av. Landscape 970. Condomínio Cyrela Ipes Alameda Tangará 115',            BAIRRO: 'Jardim Sul',       'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Casais',       PERFIL: 'Casais',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Luiz Fernando Dorneles',                CONTATO: '17981657782',  ENDEREÇO: 'Rua Sebastião Mariano de Souza 33 Casa 1',                                  BAIRRO: 'Novo Mundo',       'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Jovens',       PERFIL: 'Jovens',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Marcos Paulo Cortes Araujo',            CONTATO: '3496550333',   ENDEREÇO: 'Rua Marfim 431',                                                             BAIRRO: 'Jaragua',          'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Midia',        PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Maria Aparecida (Cida)',                CONTATO: '3491561342',   ENDEREÇO: 'Rua Newton Fonseca Arantes, 107',                                           BAIRRO: 'Daniel Fonseca',   'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Ensino',       PERFIL: 'Libras',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Mauro Sérgio',                          CONTATO: '34999764590',  ENDEREÇO: 'Av. Dos Jardins 1500 (Jardins Gênova - Alameda Iris 211)',                  BAIRRO: 'Nova Uberlandia',  'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Casais',       PERFIL: 'Casais',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Moabe Ferreira da Rocha',               CONTATO: '3488499547',   ENDEREÇO: 'Av. Getúlio Vargas 3205',                                                    BAIRRO: 'Tubalina',         'DIA DO PG': 'Segunda-feira', HORARIO: '20h00', REDE: 'S.Diaconia',     PERFIL: 'Casais',      CIDADE: 'Uberlândia', Capacidade: 0    },
  { LIDER: 'Mônica gabriela dos Santos Julião',     CONTATO: '34993023763',  ENDEREÇO: 'Av. Marcos de Freitas Costa 553',                                           BAIRRO: 'Daniel Fonseca',   'DIA DO PG': 'Quinta-feira',  HORARIO: '18h30', REDE: 'S.Kids',         PERFIL: 'Kids',        CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Noemi Junqueira Silva',                 CONTATO: '34992629399',  ENDEREÇO: 'Rua Machado de Assis, 1130 Apto 601',                                       BAIRRO: 'Lídice',           'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Teens',        PERFIL: 'Teens',       CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Paulo Roberto (Beto)',                  CONTATO: '34999169904',  ENDEREÇO: 'Rua Nego Amâncio 679',                                                       BAIRRO: 'Jd. Patricia',     'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Casais',       PERFIL: 'Casais',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Pedro Augusto Porfírio Silva',          CONTATO: '34991542393',  ENDEREÇO: 'Rua Piroluzita n° 184',                                                     BAIRRO: 'Dona Zulmira',     'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Teens',        PERFIL: 'Teens',       CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Rafael Daher Machado',                  CONTATO: '3492500911',   ENDEREÇO: 'Av. Engenheiro Diniz, 1563, Ap 301',                                        BAIRRO: 'Martins',          'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Teens e Jovens', PERFIL: 'Jovens',    CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Renato e Thaise',                       CONTATO: '61991931565',  ENDEREÇO: 'Rua Pedro José Samora, n 1700, ap 802 - Cond. Splendido',                  BAIRRO: 'Santa Monica',     'DIA DO PG': 'Quarta-feira',  HORARIO: '18h00', REDE: 'S.Adoração',     PERFIL: 'Casais',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Ricardo Melo',                          CONTATO: '3499660703',   ENDEREÇO: 'Rua Fádua Barcha Gustim, 375',                                              BAIRRO: 'Tubalina',         'DIA DO PG': 'Segunda-feira', HORARIO: '20h00', REDE: 'S.Homens',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Roberto Carlos',                        CONTATO: '3496456077',   ENDEREÇO: 'Rua Paschoal Caparelli 240',                                                BAIRRO: 'Morada da Colina', 'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Ensino',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Rodrigo Ferreira Lopes da Silva',       CONTATO: '6296960310',   ENDEREÇO: '',                                                                           BAIRRO: 'Jardins Florença', 'DIA DO PG': 'Quarta-feira',  HORARIO: '19h30', REDE: 'S.Ensino',       PERFIL: 'Jovens',      CIDADE: 'Goiânia',    Capacidade: null },
  { LIDER: 'Rodrigo Veiga',                         CONTATO: '11987291067',  ENDEREÇO: 'Rua Toneleros 201, apto 34',                                                BAIRRO: 'Vila Ipojuca',     'DIA DO PG': 'Segunda-feira', HORARIO: '20h00', REDE: 'S.Ensino',       PERFIL: 'Familia',     CIDADE: 'São Paulo',  Capacidade: null },
  { LIDER: 'Roger Augusto Gomes da Silva',          CONTATO: '3492714470',   ENDEREÇO: 'Rua Carajás 1237/301',                                                      BAIRRO: 'Lídice',           'DIA DO PG': 'Segunda-feira', HORARIO: '20h00', REDE: 'S.Casais',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Rombledo Leonardo Rodrigues Costa',     CONTATO: '3488351932',   ENDEREÇO: 'Rua das Paineiras, 590',                                                    BAIRRO: 'Cidade Jardim',    'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Ensino',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Rossano',                               CONTATO: '11995490883',  ENDEREÇO: 'Rua Apinages, 268 apto 11',                                                 BAIRRO: '',                 'DIA DO PG': 'Sexta-feira',   HORARIO: '20h00', REDE: '',               PERFIL: 'Familia',     CIDADE: 'São Paulo',  Capacidade: null },
  { LIDER: 'Sandra Valadão',                        CONTATO: '6281529279',   ENDEREÇO: 'Alameda Anísio Manoel de Oliveira, 130',                                    BAIRRO: 'Jd.Holanda',       'DIA DO PG': 'Segunda-feira', HORARIO: '19h00', REDE: 'S.Mulheres',     PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Sérgio',                                CONTATO: '6281231317',   ENDEREÇO: 'Rua C228, n177',                                                            BAIRRO: 'Jd.Bueno',         'DIA DO PG': 'Quinta-feira',  HORARIO: '19h30', REDE: 'S.Diaconia',     PERFIL: 'Familia',     CIDADE: 'Goiânia',    Capacidade: null },
  { LIDER: 'Sidney Miguel de Almeida',              CONTATO: '3491923364',   ENDEREÇO: 'Av. Frederico Tibery,32',                                                   BAIRRO: 'Tibery',           'DIA DO PG': 'Segunda-feira', HORARIO: '20h00', REDE: 'S.Casais',       PERFIL: 'Casais',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Tatiany Medeiros',                      CONTATO: '3498862842',   ENDEREÇO: 'Rua Wilson José Soares,144',                                                BAIRRO: 'Santa Rosa',       'DIA DO PG': 'Segunda-feira', HORARIO: '20h00', REDE: 'S.Ensino',       PERFIL: 'Casais',      CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Thays Porfirio',                        CONTATO: '3493348440',   ENDEREÇO: 'Av Aspirante Mega 702',                                                     BAIRRO: 'Jaraguá',          'DIA DO PG': 'Sábado',        HORARIO: '',      REDE: 'S.Ensino',       PERFIL: 'Teens',       CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Thiago Almeida de Oliveira',            CONTATO: '34991417346',  ENDEREÇO: 'Tv. Beja, 50 - Condomínio Village Paradiso 2',                             BAIRRO: 'Granja Marileusa', 'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Kids',         PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: 0    },
  { LIDER: 'Thiago Rodrigo Carmo dos Santos',       CONTATO: '34998932972',  ENDEREÇO: 'Rua Barretos,95',                                                           BAIRRO: 'Daniel Fonseca',   'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Kids',         PERFIL: 'Teens',       CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Tiago Paladino',                        CONTATO: '34984059374',  ENDEREÇO: 'Rua Maria Cristina Rodrigues, 661, casa 10',                               BAIRRO: 'Alto Umuarama',    'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Ensino',       PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'Wesley Ferreira Cabral',                CONTATO: '3497896755',   ENDEREÇO: 'Av. dos Ferreiras, 475 casa 194 (Cond. Terra Nova I)',                     BAIRRO: 'Aclimação',        'DIA DO PG': 'Segunda-feira', HORARIO: '20h00', REDE: 'S.Diaconia',     PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
  { LIDER: 'William José Dias',                     CONTATO: '34991674909',  ENDEREÇO: 'Rua Arthur Bernardes 1420',                                                 BAIRRO: 'Martins',          'DIA DO PG': 'Segunda-feira', HORARIO: '19h30', REDE: 'S.Diaconia',     PERFIL: 'Familia',     CIDADE: 'Uberlândia', Capacidade: null },
];

async function run() {
  console.log('=== Atualização da LISTA_PGS ===\n');

  // 1. Deleta todos os registros existentes
  console.log('1. Deletando registros existentes...');
  const delRes = await fetch(`${BASE}/rest/v1/LISTA_PGS?LIDER=not.is.null`, {
    method: 'DELETE',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
  });
  if (!delRes.ok) {
    const body = await delRes.text();
    throw new Error(`Erro ao deletar: ${delRes.status} ${body}`);
  }
  console.log('   Registros deletados com sucesso.\n');

  // 2. Insere todos os novos registros em lote
  console.log(`2. Inserindo ${pgs.length} PGs...`);
  const insRes = await fetch(`${BASE}/rest/v1/LISTA_PGS`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(pgs),
  });
  if (!insRes.ok) {
    const body = await insRes.text();
    throw new Error(`Erro ao inserir: ${insRes.status} ${body}`);
  }

  console.log(`   ${pgs.length} PGs inseridos com sucesso!\n`);
  console.log('=== Concluído ===');
}

run().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
