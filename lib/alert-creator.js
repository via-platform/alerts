const {Disposable, CompositeDisposable, Emitter} = require('via');
const etch = require('etch');
const $ = etch.dom;
const _ = require('underscore-plus');
const ViaTable = require('via-table');
const base = 'via://alerts/create';

module.exports = class AlertCreator {
    static deserialize({manager, omnibar}, state){
        return new AlertCreator({manager, omnibar}, state);
    }

    serialize(){
        return {
            deserializer: 'AlertCreator',
            uri: this.getURI(),
            advanced: this.advanced
        };
    }

    constructor({manager, omnibar}, state = {}){
        this.emitter = new Emitter();
        this.uri = state.uri;
        this.manager = manager;
        this.subscriptions = new CompositeDisposable();
        this.advanced = state.advanced || false;
        this.alert = this.manager.create({type: 'last-price', direction: 'above'});

        etch.initialize(this);
        this.subscriptions.add(via.commands.add(this.element, 'alert-creator:change-market', this.change.bind(this)));
        this.bindAlertEvents();

        this.initialize(state);
    }

    async initialize(state){
        await via.markets.initialize();

        const [method, id] = this.uri.slice(base.length + 1).split('/');

        if(method === 'market'){
            const market = via.markets.uri(id);
            this.changeMarket(market);
        }
    }

    render(){
        const side = this.alert.type.indexOf('-volume') === -1 ? 'quote' : 'base';
        const unit = this.alert.market ? this.alert.market[side] : 'N/A';

        return $.div({classList: 'alert-creator', tabIndex: -1},
            $.div({classList: 'alert-tools toolbar'},
                $.div({classList: 'market toolbar-button', onClick: this.change},
                    this.alert.market ? this.alert.market.title : 'Select Market'
                )
            ),
            $.form({classList: 'alert-options native-key-bindings'},
                $.div({classList: 'alert-label'},
                    $.div({}, 'Alert Me When The'),
                    this.alert.market && !this.alert.exchangeSupportsAlertType() ? $.div({classList: 'error'}, 'Not Available') : ''
                ),
                $.select({classList: 'alert-type input-select', ref: 'type', value: this.alert.type, onInput: () => this.alert.type = this.refs.type.value},
                    $.option({value: 'last-price'}, 'Last Price')//,
                    // $.option({value: '86400-volume'}, '24h Volume')
                ),
                $.select({classList: 'alert-type input-select', ref: 'direction', value: this.alert.direction, onInput: () => this.alert.direction = this.refs.direction.value},
                    $.option({value: 'above'}, 'Rises Above'),
                    $.option({value: 'below'}, 'Falls Below'),
                    $.option({value: 'cross'}, 'Crosses (Up or Down)')
                ),
                $.div({classList: 'input-unit'},
                    $.div({classList: 'input-unit-label'}, unit),
                    $.input({
                        classList: 'alert-field input-text',
                        type: 'text',
                        placeholder: '0.00',
                        ref: 'value',
                        onInput: this.didInput,
                        value: this.alert.value ? this.alert.value : ''
                    })
                ),
                $.div({classList: `toggle-advanced ${this.advanced ? 'active' : 'inactive'}`, onClick: this.toggleAdvanced},
                    $.div({classList: 'caret'}),
                    $.div({}, 'Advanced Options')
                ),
                $.div({classList: `advanced-options ${this.advanced ? '' : 'hidden'}`},
                    $.div({classList: 'controls'},
                        $.div({classList: 'checkbox'},
                            $.label({},
                                $.input({type: 'checkbox', classList: 'input-checkbox', ref: 'kill', checked: this.alert.kill, onClick: () => this.alert.kill = this.refs.kill.checked}),
                                $.div({classList: 'setting-title'}, 'Cancel After Trigger')
                            )
                        )
                    ),
                    $.div({classList: 'controls'},
                        $.div({classList: 'checkbox'},
                            $.label({},
                                $.input({type: 'checkbox', classList: 'input-checkbox', ref: 'email', checked: this.alert.email, onClick: () => this.alert.email = this.refs.email.checked}),
                                $.div({classList: 'setting-title'}, 'Send Email Alert')
                            )
                        )
                    ),
                    $.div({classList: 'controls'},
                        $.div({classList: 'checkbox'},
                            $.label({},
                                $.input({type: 'checkbox', classList: 'input-checkbox', ref: 'sms', checked: this.alert.sms, onClick: () => this.alert.sms = this.refs.sms.checked}),
                                $.div({classList: 'setting-title'}, 'Send SMS Alert')
                            )
                        )
                    ),
                    $.div({classList: 'alert-label'}, $.div({}, 'Alert Cooldown')),
                    $.div({classList: 'input-unit'},
                        $.div({classList: 'input-unit-label'}, 'SEC'),
                        $.input({
                            classList: 'alert-field input-text',
                            type: 'text',
                            placeholder: '0',
                            ref: 'cooldown',
                            onInput: () => this.alert.cooldown = parseInt(this.refs.cooldown.value || 0),
                            value: this.alert.cooldown ? this.alert.cooldown : ''
                        })
                    ),
                    $.div({classList: 'alert-label'}, $.div({}, 'Expires In')),
                    $.select({classList: 'alert-type input-select', ref: 'expires', value: this.alert.expires, onInput: () => this.alert.expires = this.refs.expires.value},
                        $.option({value: 'gtc'}, 'Good Til Canceled'),
                        $.option({value: '1-minute'}, '1 Minute'),
                        $.option({value: '5-minutes'}, '5 Minutes'),
                        $.option({value: '15-minutes'}, '15 Minutes'),
                        $.option({value: '1-hour'}, '1 Hour'),
                        $.option({value: '6-hours'}, '6 Hours'),
                        $.option({value: '24-hours'}, '24 Hours'),
                        $.option({value: '7-days'}, '7 Days'),
                        $.option({value: '30-days'}, '30 Days')
                    )
                ),
                $.button({
                    classList: ['btn btn-primary alert-transmit', this.alert.status, this.alert.isValidAlert() ? 'valid' : 'invalid'].join(' '),
                    onClick: () => this.alert.transmit()
                }, (this.alert.status === 'transmitting') ? 'Creating...' : 'Create Alert')
            )
        );
    }

    toggleAdvanced(){
        this.advanced = !this.advanced;
        this.update();
    }

    didInput(){
        const value = this.refs.value ? parseFloat(this.refs.value.value) : undefined;
        this.alert.value = (_.isNumber(value) && !_.isNaN(value)) ? value : undefined;
    }

    update(){
        etch.update(this);
    }

    save(){
        //Save the Alert to the Alerts panel and clear the fields here, but do not transmit it
        this.reset();
    }

    change(){
        if(!this.manager.omnibar) return console.error('Could not find omnibar.');

        this.manager.omnibar.search({
            name: 'Change Market',
            placeholder: 'Enter a Market for Your Alert...',
            didConfirmSelection: selection => this.changeMarket(selection.market),
            maxResultsPerCategory: 60,
            items: via.markets.all().filter(m => m.active && m.type === 'SPOT').map(m => ({name: m.title, description: m.description, market: m}))
        });
    }

    changeMarket(market){
        this.alert.market = market;
        this.emitter.emit('did-change-title');
    }

    destroy(){
        if(this.disposables) this.disposables.dispose();

        this.alert.destroy();
        this.subscriptions.dispose();
        this.emitter.emit('did-destroy');
        this.emitter.dispose();
    }

    getURI(){
        return this.alert.market ? `${base}/market/${this.alert.market.uri()}` : base;
    }

    getTitle(){
        return this.alert.market ? `Create Alert, ${this.alert.market.title}` : 'Create Alert';
    }

    bindAlertEvents(){
        if(this.disposables) this.disposables.dispose();
        this.disposables = new CompositeDisposable();

        this.disposables.add(this.alert.onDidDestroy(this.reset.bind(this)));
        this.disposables.add(this.alert.onDidUpdate(this.update.bind(this)));
        this.disposables.add(this.alert.onDidUpdateMarket(this.didUpdateMarket.bind(this)));
        this.disposables.add(this.alert.onWillTransmit(this.update.bind(this)));
        this.disposables.add(this.alert.onDidTransmit(this.reset.bind(this)));
        this.disposables.add(this.alert.onDidTransmitError(this.update.bind(this)));

        this.didUpdateMarket();
    }

    didUpdateMarket(){

        this.update();
        this.emitter.emit('did-change-market', this.alert.market);
    }

    getMarket(){
        return this.alert.market;
    }

    reset(){

        this.alert = this.manager.create({market: this.alert.market, type: this.alert.type, direction: this.alert.direction});
        this.bindAlertEvents();
        this.update();
    }

    onDidChangeMarket(callback){
        return this.emitter.on('did-change-market', callback);
    }

    onDidDestroy(callback){
        return this.emitter.on('did-destroy', callback);
    }

    onDidChangeTitle(callback){
        return this.emitter.on('did-change-title', callback);
    }
}
