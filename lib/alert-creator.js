const {Disposable, CompositeDisposable, Emitter} = require('via');
const etch = require('etch');
const $ = etch.dom;
const _ = require('underscore-plus');
const ViaTable = require('via-table');
const base = 'via://alerts/create';

module.exports = class AlertCreator {
    constructor(params = {}){
        this.emitter = new Emitter();
        this.uri = params.uri;
        this.manager = params.manager;
        this.subscriptions = new CompositeDisposable();

        this.alert = this.manager.create({
            market: via.markets.findByIdentifier(this.uri.slice(base.length + 1)),
            type: 'value-above'
        });

        etch.initialize(this);
        this.subscriptions.add(via.commands.add(this.element, 'alerts:change-market', this.change.bind(this)));
        this.bindAlertEvents();
    }

    render(){
        return $.div({classList: 'alert-creator', tabIndex: -1},
            $.div({classList: 'alert-tools toolbar'},
                $.div({classList: 'market toolbar-button', onClick: this.change},
                    this.alert.market ? this.alert.market.title() : 'Select Market'
                )
            ),
            $.form({classList: 'alert-options native-key-bindings'},
                $.div({classList: 'alert-label'},
                    $.div({}, 'Alert Me When'),
                    this.alert.market && !this.alert.exchangeSupportsAlertType() ? $.div({classList: 'error'}, 'Not Available') : ''
                ),
                $.select({classList: 'alert-type input-select', ref: 'type', value: this.alert.type, onInput: () => this.alert.type = this.refs.type.value},
                    $.option({value: 'value-above'}, 'Value Goes Above'),
                    $.option({value: 'value-below'}, 'Value Goes Below'),
                    $.option({value: 'value-crosses'}, 'Value Crosses (Up or Down)')
                ),
                $.div({classList: 'alert-label'}, 'Trigger Value'),
                $.div({classList: 'input-unit'},
                    $.div({classList: 'input-unit-label'}, this.alert.market ? this.alert.market.quote : 'N/A'),
                    $.input({
                        classList: 'alert-field input-text',
                        type: 'text',
                        placeholder: '0.00',
                        ref: 'value',
                        onInput: this.didInput
                    })
                ),
                $.button({
                    classList: ['alert-transmit', this.alert.status, this.alert.isValidAlert() ? 'valid' : 'invalid'].join(' '),
                    onClick: () => this.alert.transmit()
                }, (this.alert.status === 'transmitting') ? 'Creating...' : 'Create Alert')
            )
        );
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
            didConfirmSelection: this.changeMarket.bind(this),
            maxResultsPerCategory: 30,
            items: via.markets.all()
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
        return this.uri;
    }

    getTitle(){
        return 'Create Alert';
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



        //RESET HAS TO ALSO CLEAR THE VALUE FIELD




        this.alert = this.manager.create({market: this.alert.market, type: this.alert.type});
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
